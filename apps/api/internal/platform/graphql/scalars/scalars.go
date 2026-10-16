package scalars

import (
	"bytes"
	"context"
	"encoding/json"
	"io"
	"regexp"
	"strings"
	"time"
	"unicode/utf8"

	gql "github.com/99designs/gqlgen/graphql"
	"github.com/google/uuid"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/apierr"
	"github.com/piyushsatti/chronicler/apps/api/internal/platform/product"
)

type ID = string
type Date = product.Date
type Time = product.Time
type DateTime = time.Time
type JSON = json.RawMessage

const maxJSONBytes = 256 * 1024
const maxJSONDepth = 16

var dateTimePattern = regexp.MustCompile(`^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.([0-9]+))?(?:Z|[+-](?:[01][0-9]|2[0-3]):[0-5][0-9])$`)

func UnmarshalID(value any) (string, error) {
	text, ok := value.(string)
	if !ok || len(text) != 36 || text[8] != '-' || text[13] != '-' || text[18] != '-' || text[23] != '-' {
		return "", invalid("ID")
	}
	id, err := uuid.Parse(text)
	if err != nil {
		return "", invalid("ID")
	}
	return id.String(), nil
}

func MarshalID(value string) gql.ContextMarshaler {
	text, err := UnmarshalID(value)
	return marshalString(text, err)
}

func UnmarshalDate(value any) (product.Date, error) {
	text, ok := value.(string)
	if !ok || len(text) != 10 {
		return "", invalid("Date")
	}
	date, err := time.Parse(time.DateOnly, text)
	if err != nil || date.Format(time.DateOnly) != text {
		return "", invalid("Date")
	}
	return product.Date(text), nil
}

func MarshalDate(value product.Date) gql.ContextMarshaler {
	date, err := UnmarshalDate(string(value))
	return marshalString(string(date), err)
}

func UnmarshalTime(value any) (product.Time, error) {
	text, ok := value.(string)
	if !ok || (len(text) != 5 && len(text) != 8) {
		return "", invalid("Time")
	}
	if len(text) == 5 {
		text += ":00"
	}
	if text == "24:00:00" {
		return product.Time(text), nil
	}
	parsed, err := time.Parse(time.TimeOnly, text)
	if err != nil || parsed.Format(time.TimeOnly) != text || parsed.Second() != 0 {
		return "", invalid("Time")
	}
	return product.Time(text), nil
}

func MarshalTime(value product.Time) gql.ContextMarshaler {
	clock, err := UnmarshalTime(string(value))
	return marshalString(string(clock), err)
}

func UnmarshalDateTime(value any) (time.Time, error) {
	text, ok := value.(string)
	if !ok {
		return time.Time{}, invalid("DateTime")
	}
	matches := dateTimePattern.FindStringSubmatch(text)
	if matches == nil {
		return time.Time{}, invalid("DateTime")
	}
	fraction := matches[1]
	if len(fraction) > 6 && strings.Trim(fraction[6:], "0") != "" {
		return time.Time{}, invalid("DateTime")
	}
	parsed, err := time.Parse(time.RFC3339Nano, text)
	if err != nil {
		return time.Time{}, invalid("DateTime")
	}
	parsed = parsed.UTC()
	if parsed.Year() < 0 || parsed.Year() > 9999 {
		return time.Time{}, invalid("DateTime")
	}
	return parsed, nil
}

func MarshalDateTime(value time.Time) gql.ContextMarshaler {
	value = value.UTC()
	if value.Nanosecond()%1000 != 0 || value.Year() < 0 || value.Year() > 9999 {
		return marshalString("", invalid("DateTime"))
	}
	return marshalString(value.UTC().Format(time.RFC3339Nano), nil)
}

func UnmarshalJSON(value any) (json.RawMessage, error) {
	encoded, err := json.Marshal(value)
	if err != nil || validateJSON(encoded) != nil {
		return nil, invalid("JSON")
	}
	return json.RawMessage(encoded), nil
}

func MarshalJSON(value json.RawMessage) gql.ContextMarshaler {
	// A snapshot prevents a caller mutating the validated bytes before serialization.
	encoded := bytes.Clone(value)
	return marshalBytes(encoded, validateJSON(encoded))
}

func validateJSON(encoded []byte) error {
	if len(encoded) == 0 || len(encoded) > maxJSONBytes || !utf8.Valid(encoded) {
		return invalid("JSON")
	}
	decoder := json.NewDecoder(bytes.NewReader(encoded))
	decoder.UseNumber()
	depth := 0
	for {
		token, err := decoder.Token()
		if err == io.EOF {
			break
		}
		if err != nil {
			return invalid("JSON")
		}
		if delimiter, ok := token.(json.Delim); ok {
			switch delimiter {
			case '{', '[':
				depth++
				if depth > maxJSONDepth {
					return invalid("JSON")
				}
			case '}', ']':
				depth--
			}
		}
	}
	if !json.Valid(encoded) {
		return invalid("JSON")
	}
	return nil
}

func invalid(name string) error { return apierr.New(apierr.Invalid, "Invalid "+name) }

func marshalString(value string, err error) gql.ContextMarshaler {
	encoded, encodeErr := json.Marshal(value)
	if err == nil {
		err = encodeErr
	}
	return marshalBytes(encoded, err)
}

func marshalBytes(encoded []byte, validationErr error) gql.ContextMarshaler {
	return gql.ContextWriterFunc(func(_ context.Context, writer io.Writer) error {
		if validationErr != nil {
			return apierr.New(apierr.Internal, "Internal error")
		}
		n, err := writer.Write(encoded)
		if err == nil && n != len(encoded) {
			return io.ErrShortWrite
		}
		return err
	})
}
