package idempotency

import (
	"bytes"
	"encoding/json"
	"errors"
	"io"
	"reflect"
	"strings"
	"time"
	"unicode/utf8"

	"github.com/google/uuid"
)

const (
	maxReceiptBytes           = 16 << 20
	notificationProofsKey     = "_notificationProofs"
	notificationResultKey     = "_notificationResult"
	authorizationOverridesKey = "_authorizationOverrides"
)

func invalidReceiptMetadata() error { return errors.New("invalid command receipt metadata") }

// ValidateUniqueJSON is shared by durable command metadata and typed inbox facts.
func ValidateUniqueJSON(raw []byte) error {
	if len(raw) == 0 || len(raw) > maxReceiptBytes || !utf8.Valid(raw) {
		return invalidReceiptMetadata()
	}
	decoder := json.NewDecoder(bytes.NewReader(raw))
	decoder.UseNumber()
	var value func(int) error
	value = func(depth int) error {
		if depth > 16 {
			return invalidReceiptMetadata()
		}
		token, err := decoder.Token()
		if err != nil {
			return invalidReceiptMetadata()
		}
		delimiter, nested := token.(json.Delim)
		if !nested {
			return nil
		}
		seen := map[string]bool{}
		for decoder.More() {
			if delimiter == '{' {
				key, err := decoder.Token()
				name, ok := key.(string)
				if err != nil || !ok || seen[name] {
					return invalidReceiptMetadata()
				}
				seen[name] = true
			}
			if err := value(depth + 1); err != nil {
				return err
			}
		}
		_, err = decoder.Token()
		return err
	}
	if err := value(0); err != nil {
		return invalidReceiptMetadata()
	}
	if _, err := decoder.Token(); err != io.EOF {
		return invalidReceiptMetadata()
	}
	return nil
}

// StrictJSON rejects duplicate, unknown and differently cased nested fields.
func StrictJSON(raw []byte, target any) error {
	if err := ValidateUniqueJSON(raw); err != nil {
		return err
	}
	typ := reflect.TypeOf(target)
	if typ == nil || typ.Kind() != reflect.Pointer || reflect.ValueOf(target).IsNil() {
		return invalidReceiptMetadata()
	}
	if err := exactJSONFields(raw, typ.Elem()); err != nil {
		return err
	}
	decoder := json.NewDecoder(bytes.NewReader(raw))
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(target); err != nil {
		return invalidReceiptMetadata()
	}
	return nil
}

func exactJSONFields(raw []byte, typ reflect.Type) error {
	for typ.Kind() == reflect.Pointer {
		typ = typ.Elem()
	}
	if bytes.Equal(bytes.TrimSpace(raw), []byte("null")) || reflect.PointerTo(typ).Implements(reflect.TypeFor[json.Unmarshaler]()) {
		return nil
	}
	switch typ.Kind() {
	case reflect.Struct:
		var fields map[string]json.RawMessage
		if err := json.Unmarshal(raw, &fields); err != nil {
			return invalidReceiptMetadata()
		}
		for name, value := range fields {
			found := false
			for i := 0; i < typ.NumField(); i++ {
				field := typ.Field(i)
				if strings.Split(field.Tag.Get("json"), ",")[0] == name {
					found = true
					if err := exactJSONFields(value, field.Type); err != nil {
						return err
					}
					break
				}
			}
			if !found {
				return invalidReceiptMetadata()
			}
		}
	case reflect.Slice:
		var values []json.RawMessage
		if err := json.Unmarshal(raw, &values); err != nil {
			return invalidReceiptMetadata()
		}
		for _, value := range values {
			if err := exactJSONFields(value, typ.Elem()); err != nil {
				return err
			}
		}
	}
	return nil
}

func receiptMetadataObject(raw []byte) (map[string]json.RawMessage, error) {
	if err := ValidateUniqueJSON(raw); err != nil {
		return nil, err
	}
	if bytes.TrimSpace(raw)[0] != '{' {
		return nil, nil
	}
	var object map[string]json.RawMessage
	if err := json.Unmarshal(raw, &object); err != nil {
		return nil, invalidReceiptMetadata()
	}
	metadata := 0
	for _, key := range []string{notificationProofsKey, authorizationOverridesKey} {
		if value, ok := object[key]; ok {
			var items []json.RawMessage
			if err := json.Unmarshal(value, &items); err != nil || len(items) == 0 {
				return nil, invalidReceiptMetadata()
			}
			metadata++
		}
	}
	if result, wrapped := object[notificationResultKey]; wrapped {
		if metadata == 0 || len(object) != metadata+1 || len(bytes.TrimSpace(result)) == 0 || bytes.TrimSpace(result)[0] != '[' {
			return nil, invalidReceiptMetadata()
		}
	}
	return object, nil
}

func appendReceiptMetadata(result json.RawMessage, key string, value json.RawMessage) (json.RawMessage, error) {
	object, err := receiptMetadataObject(result)
	if err != nil {
		return nil, err
	}
	if object == nil {
		if bytes.TrimSpace(result)[0] != '[' {
			return nil, invalidReceiptMetadata()
		}
		object = map[string]json.RawMessage{notificationResultKey: bytes.Clone(result)}
	}
	if _, exists := object[key]; exists {
		return nil, invalidReceiptMetadata()
	}
	object[key] = bytes.Clone(value)
	stored, err := json.Marshal(object)
	if err != nil || len(stored) > maxReceiptBytes {
		return nil, invalidReceiptMetadata()
	}
	if _, err := receiptMetadataObject(stored); err != nil {
		return nil, err
	}
	return stored, nil
}

func peelReceiptMetadata(receipt json.RawMessage, key string) (json.RawMessage, json.RawMessage, error) {
	object, err := receiptMetadataObject(receipt)
	if err != nil {
		return nil, nil, err
	}
	if object == nil {
		return bytes.Clone(receipt), nil, nil
	}
	metadata, found := object[key]
	if !found {
		return bytes.Clone(receipt), nil, nil
	}
	delete(object, key)
	if result, wrapped := object[notificationResultKey]; wrapped && object[notificationProofsKey] == nil && object[authorizationOverridesKey] == nil {
		return bytes.Clone(result), bytes.Clone(metadata), nil
	}
	result, err := json.Marshal(object)
	return result, bytes.Clone(metadata), err
}

func AppendNotificationProofs(result, proofs json.RawMessage) (json.RawMessage, error) {
	return appendReceiptMetadata(result, notificationProofsKey, proofs)
}

// PeelNotificationProofs retains any other sidecar until its owner validates it.
func PeelNotificationProofs(receipt json.RawMessage) (json.RawMessage, json.RawMessage, error) {
	return peelReceiptMetadata(receipt, notificationProofsKey)
}

func validateOverrideFact(fact CommandOverrideFact, identity claimIdentity) error {
	if fact.ActorID != identity.actorID || fact.Operation != "Mutation."+identity.operation || fact.At.IsZero() || !fact.At.Equal(fact.At.Truncate(time.Microsecond)) {
		return invalidReceiptMetadata()
	}
	if _, offset := fact.At.Zone(); offset != 0 {
		return invalidReceiptMetadata()
	}
	switch fact.RuleCode {
	case "ROLE", "OWNERSHIP", "ASSIGNMENT", "AUDIENCE":
	default:
		return invalidReceiptMetadata()
	}
	switch fact.SubjectType {
	case "member", "character", "document", "quest", "spatial", "site", "notification":
	default:
		return invalidReceiptMetadata()
	}
	if fact.SubjectType == "site" && (fact.SubjectID == "home_banner" || fact.SubjectID == "quest_announcement_role") || fact.SubjectType == "spatial" && fact.SubjectID == "game-calendar" {
		return nil
	}
	id, err := uuid.Parse(fact.SubjectID)
	if err != nil || id == uuid.Nil || id.String() != fact.SubjectID {
		return invalidReceiptMetadata()
	}
	return nil
}

func decodeAuthorizationReceipt(receipt json.RawMessage, identity claimIdentity) (json.RawMessage, error) {
	// Preserve the exact no-sidecar legacy path, including scalar JSON results.
	var object map[string]json.RawMessage
	if bytes.TrimSpace(receipt)[0] != '{' || json.Unmarshal(receipt, &object) != nil {
		return bytes.Clone(receipt), nil
	}
	if _, found := object[authorizationOverridesKey]; !found {
		return bytes.Clone(receipt), nil
	}
	result, encoded, err := peelReceiptMetadata(receipt, authorizationOverridesKey)
	if err != nil {
		return nil, err
	}
	var facts []CommandOverrideFact
	if err := StrictJSON(encoded, &facts); err != nil || len(facts) == 0 {
		return nil, invalidReceiptMetadata()
	}
	for _, fact := range facts {
		if err := validateOverrideFact(fact, identity); err != nil {
			return nil, err
		}
	}
	return result, nil
}
