package character

import (
	"bytes"
	"context"
	"crypto/sha256"
	"crypto/tls"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"math"
	"net"
	"net/http"
	"net/netip"
	"net/url"
	"sort"
	"strconv"
	"strings"
	"time"

	"github.com/piyushsatti/chronicler/apps/api/internal/platform/product"
)

const (
	ddbProviderHost     = "character-service.dndbeyond.com"
	ddbProviderOrigin   = "https://" + ddbProviderHost
	ddbParserVersion    = "v1"
	ddbMaxResponseBytes = 2 << 20
	ddbMaxJSONDepth     = 32
	ddbMaxModifierRows  = 5000
	ddbMaxProficiencies = 100
	ddbRequestTimeout   = 10 * time.Second
	ddbMaxRedirects     = 3
)

type DdbSnapshot struct {
	Payload       json.RawMessage
	Level         *int32
	XP            *int32
	ArmorClass    *int32
	MaxHP         *int32
	Species       *string
	Classes       *string
	Background    *string
	Proficiencies []DDBProficiencyView
}

type DdbProvenance struct {
	SourceURL        string
	FetchedAt        time.Time
	PayloadSHA256    string
	FixtureCaptureID *string
	ParserVersion    string
}

type DdbClient interface {
	Fetch(ctx context.Context, url string) (DdbSnapshot, DdbProvenance, error)
}

type HTTPDdbClient struct {
	Client *http.Client
	Clock  product.Clock
}

type DdbErrorCode string

const (
	DdbErrorInvalid      DdbErrorCode = "INVALID"
	DdbErrorTimeout      DdbErrorCode = "TIMEOUT"
	DdbErrorProviderHTTP DdbErrorCode = "PROVIDER_HTTP"
	DdbErrorUnavailable  DdbErrorCode = "UNAVAILABLE"
	DdbErrorPayloadDrift DdbErrorCode = "PAYLOAD_DRIFT"
)

type DdbError struct {
	Code DdbErrorCode
}

func (e DdbError) Error() string { return string(e.Code) }

func NewDdbClient(client *http.Client, clock product.Clock) (*HTTPDdbClient, error) {
	if client == nil || clock == nil {
		return nil, errors.New("DDB client dependencies are required")
	}
	clone := *client
	clone.Timeout = ddbRequestTimeout
	clone.Jar = nil
	clone.CheckRedirect = func(req *http.Request, via []*http.Request) error {
		if len(via) > ddbMaxRedirects || req.URL.Scheme != "https" || !strings.EqualFold(req.URL.Hostname(), ddbProviderHost) || req.URL.Port() != "" || req.URL.User != nil {
			return http.ErrUseLastResponse
		}
		return nil
	}
	return &HTTPDdbClient{Client: &clone, Clock: clock}, nil
}

func NewProductionDdbHTTPClient() (*http.Client, error) {
	transport := newDdbTransport(net.DefaultResolver)
	return &http.Client{Transport: transport, Timeout: ddbRequestTimeout}, nil
}

func newDdbTransport(resolver *net.Resolver) *http.Transport {
	return &http.Transport{
		Proxy:             nil,
		ForceAttemptHTTP2: true,
		TLSClientConfig:   &tls.Config{MinVersion: tls.VersionTLS12, ServerName: ddbProviderHost},
		DialContext: func(ctx context.Context, network, address string) (net.Conn, error) {
			host, port, err := net.SplitHostPort(address)
			if err != nil || host != ddbProviderHost || port != "443" {
				return nil, errors.New("DDB dial target rejected")
			}
			resolved, err := resolver.LookupIPAddr(ctx, ddbProviderHost)
			if err != nil {
				return nil, err
			}
			var lastErr error
			for _, candidate := range resolved {
				ip := candidate.IP
				if ipv4 := candidate.IP.To4(); ipv4 != nil {
					ip = ipv4
				}
				if !publicDdbIP(ip) {
					continue
				}
				conn, dialErr := (&net.Dialer{}).DialContext(ctx, network, net.JoinHostPort(ip.String(), port))
				if dialErr == nil {
					return conn, nil
				}
				lastErr = dialErr
			}
			if lastErr != nil {
				return nil, lastErr
			}
			return nil, errors.New("DDB DNS returned no public address")
		},
	}
}

func publicDdbIP(ip net.IP) bool {
	address, ok := netip.AddrFromSlice(ip)
	if !ok {
		return false
	}
	address = address.Unmap()
	if !address.IsGlobalUnicast() || address.IsPrivate() || address.IsLoopback() || address.IsLinkLocalUnicast() || address.IsMulticast() || address.IsUnspecified() {
		return false
	}
	blocked := []string{
		"0.0.0.0/8", "100.64.0.0/10", "192.0.0.0/24", "192.0.2.0/24", "192.88.99.0/24",
		"198.18.0.0/15", "198.51.100.0/24", "203.0.113.0/24", "224.0.0.0/4", "240.0.0.0/4",
		"2001:db8::/32", "2001:10::/28", "2002::/16", "3fff::/20",
	}
	if address.Is6() && !netip.MustParsePrefix("2000::/3").Contains(address) {
		return false
	}
	for _, cidr := range blocked {
		if netip.MustParsePrefix(cidr).Contains(address) {
			return false
		}
	}
	return true
}

func (c *HTTPDdbClient) Fetch(ctx context.Context, rawURL string) (DdbSnapshot, DdbProvenance, error) {
	characterID, err := canonicalDdbCharacterID(rawURL)
	if err != nil {
		return DdbSnapshot{}, DdbProvenance{}, DdbError{Code: DdbErrorInvalid}
	}
	ctx, cancel := context.WithTimeout(ctx, ddbRequestTimeout)
	defer cancel()
	sourceURL := ddbProviderOrigin + "/character/v5/character/" + characterID
	request, err := http.NewRequestWithContext(ctx, http.MethodGet, sourceURL, nil)
	if err != nil {
		return DdbSnapshot{}, DdbProvenance{}, DdbError{Code: DdbErrorInvalid}
	}
	request.Header.Set("Accept", "application/json")
	response, err := c.Client.Do(request)
	if err != nil {
		return DdbSnapshot{}, DdbProvenance{}, classifyDdbFetchError(ctx, err)
	}
	defer response.Body.Close()
	if response.StatusCode != http.StatusOK {
		return DdbSnapshot{}, DdbProvenance{}, DdbError{Code: DdbErrorProviderHTTP}
	}
	body, err := io.ReadAll(io.LimitReader(response.Body, ddbMaxResponseBytes+1))
	if err != nil {
		return DdbSnapshot{}, DdbProvenance{}, classifyDdbFetchError(ctx, err)
	}
	if len(body) > ddbMaxResponseBytes {
		return DdbSnapshot{}, DdbProvenance{}, DdbError{Code: DdbErrorPayloadDrift}
	}
	snapshot, err := parseDdbPayload(body, characterID)
	if err != nil {
		return DdbSnapshot{}, DdbProvenance{}, DdbError{Code: DdbErrorPayloadDrift}
	}
	if errors.Is(ctx.Err(), context.DeadlineExceeded) {
		return DdbSnapshot{}, DdbProvenance{}, DdbError{Code: DdbErrorTimeout}
	}
	digest := sha256.Sum256(body)
	return snapshot, DdbProvenance{
		SourceURL: sourceURL, FetchedAt: c.Clock(), PayloadSHA256: hex.EncodeToString(digest[:]), ParserVersion: ddbParserVersion,
	}, nil
}

func classifyDdbFetchError(ctx context.Context, err error) error {
	if errors.Is(ctx.Err(), context.DeadlineExceeded) || errors.Is(err, context.DeadlineExceeded) {
		return DdbError{Code: DdbErrorTimeout}
	}
	var urlErr *url.Error
	if errors.As(err, &urlErr) && errors.Is(urlErr.Err, http.ErrUseLastResponse) {
		return DdbError{Code: DdbErrorProviderHTTP}
	}
	var netErr net.Error
	if errors.As(err, &netErr) && netErr.Timeout() {
		return DdbError{Code: DdbErrorTimeout}
	}
	return DdbError{Code: DdbErrorUnavailable}
}

func canonicalDdbCharacterID(raw string) (string, error) {
	parsed, err := url.Parse(raw)
	if err != nil || parsed.Scheme != "https" || !strings.EqualFold(parsed.Hostname(), "www.dndbeyond.com") || parsed.Port() != "" || parsed.User != nil || parsed.RawQuery != "" || parsed.Fragment != "" || parsed.Opaque != "" {
		return "", errors.New("invalid DDB character URL")
	}
	path := strings.TrimSuffix(parsed.Path, "/")
	const prefix = "/characters/"
	if !strings.HasPrefix(path, prefix) {
		return "", errors.New("invalid DDB character URL")
	}
	id := strings.TrimPrefix(path, prefix)
	if id == "" || strings.Contains(id, "/") {
		return "", errors.New("invalid DDB character URL")
	}
	for _, digit := range id {
		if digit < '0' || digit > '9' {
			return "", errors.New("invalid DDB character URL")
		}
	}
	value, err := strconv.ParseUint(id, 10, 63)
	if err != nil || value == 0 {
		return "", errors.New("invalid DDB character URL")
	}
	return strconv.FormatUint(value, 10), nil
}

func parseDdbPayload(payload []byte, requestedID string) (DdbSnapshot, error) {
	if len(payload) == 0 || !jsonDepthWithin(payload, ddbMaxJSONDepth) {
		return DdbSnapshot{}, errors.New("invalid DDB payload")
	}
	decoder := json.NewDecoder(bytes.NewReader(payload))
	decoder.UseNumber()
	var envelope map[string]json.RawMessage
	if err := decoder.Decode(&envelope); err != nil || ensureJSONEOF(decoder) != nil {
		return DdbSnapshot{}, errors.New("invalid DDB payload")
	}
	var success bool
	if raw, ok := envelope["success"]; !ok || json.Unmarshal(raw, &success) != nil || !success {
		return DdbSnapshot{}, errors.New("invalid DDB envelope")
	}
	var data map[string]json.RawMessage
	if raw, ok := envelope["data"]; !ok || json.Unmarshal(raw, &data) != nil || data == nil {
		return DdbSnapshot{}, errors.New("invalid DDB data")
	}
	var id json.Number
	if raw, ok := data["id"]; !ok || decodeNumber(raw, &id) != nil {
		return DdbSnapshot{}, errors.New("invalid DDB identity")
	}
	gotID, err := strconv.ParseInt(id.String(), 10, 64)
	wantedID, wantedErr := strconv.ParseInt(requestedID, 10, 64)
	if err != nil || wantedErr != nil || gotID <= 0 || gotID != wantedID {
		return DdbSnapshot{}, errors.New("invalid DDB identity")
	}

	currentXP, err := requiredInt32(data, "currentXp", 0, math.MaxInt32)
	if err != nil {
		return DdbSnapshot{}, err
	}
	classes, level, err := parseDdbClasses(data["classes"])
	if err != nil {
		return DdbSnapshot{}, err
	}
	species, err := parseDdbSpecies(data["race"])
	if err != nil {
		return DdbSnapshot{}, err
	}
	background, err := parseDdbBackground(data["background"])
	if err != nil {
		return DdbSnapshot{}, err
	}
	armorClass := optionalInt32(data["armorClass"])
	maxHP := optionalInt32(data["overrideHitPoints"])
	proficiencies, err := parseDdbProficiencies(data["modifiers"])
	if err != nil {
		return DdbSnapshot{}, err
	}
	type projectionProficiency struct {
		Kind string `json:"kind"`
		Name string `json:"name"`
	}
	projectionProficiencies := make([]projectionProficiency, len(proficiencies))
	for index, proficiency := range proficiencies {
		projectionProficiencies[index].Kind = proficiency.Kind
		projectionProficiencies[index].Name = proficiency.Name
	}
	projection, err := json.Marshal(struct {
		Level         int32                   `json:"level"`
		XP            int32                   `json:"xp"`
		ArmorClass    *int32                  `json:"armorClass"`
		MaxHP         *int32                  `json:"maxHp"`
		Species       string                  `json:"species"`
		Classes       string                  `json:"classes"`
		Background    *string                 `json:"background"`
		Proficiencies []projectionProficiency `json:"proficiencies"`
	}{
		Level: level, XP: currentXP, ArmorClass: armorClass, MaxHP: maxHP,
		Species: species, Classes: classes, Background: background, Proficiencies: projectionProficiencies,
	})
	if err != nil {
		return DdbSnapshot{}, errors.New("invalid DDB projection")
	}
	return DdbSnapshot{
		Payload: projection, Level: &level, XP: &currentXP,
		ArmorClass: armorClass, MaxHP: maxHP, Species: &species, Classes: &classes,
		Background: background, Proficiencies: proficiencies,
	}, nil
}

func ensureJSONEOF(decoder *json.Decoder) error {
	var extra any
	if err := decoder.Decode(&extra); err != io.EOF {
		return errors.New("trailing JSON")
	}
	return nil
}

func jsonDepthWithin(payload []byte, maximum int) bool {
	depth := 0
	inString, escaped := false, false
	for _, char := range payload {
		if inString {
			if escaped {
				escaped = false
			} else if char == '\\' {
				escaped = true
			} else if char == '"' {
				inString = false
			}
			continue
		}
		switch char {
		case '"':
			inString = true
		case '{', '[':
			depth++
			if depth > maximum {
				return false
			}
		case '}', ']':
			depth--
			if depth < 0 {
				return false
			}
		}
	}
	return depth == 0 && !inString
}

func decodeNumber(raw json.RawMessage, number *json.Number) error {
	decoder := json.NewDecoder(bytes.NewReader(raw))
	decoder.UseNumber()
	var value any
	if err := decoder.Decode(&value); err != nil {
		return err
	}
	parsed, ok := value.(json.Number)
	if !ok || ensureJSONEOF(decoder) != nil {
		return errors.New("expected JSON number")
	}
	*number = parsed
	return nil
}

func requiredInt32(data map[string]json.RawMessage, key string, minimum, maximum int64) (int32, error) {
	raw, ok := data[key]
	if !ok {
		return 0, errors.New("missing integer")
	}
	var number json.Number
	if decodeNumber(raw, &number) != nil {
		return 0, errors.New("invalid integer")
	}
	value, err := strconv.ParseInt(number.String(), 10, 64)
	if err != nil || value < minimum || value > maximum {
		return 0, errors.New("integer outside range")
	}
	return int32(value), nil
}

func parseDdbClasses(raw json.RawMessage) (string, int32, error) {
	var classes []json.RawMessage
	if len(raw) == 0 || json.Unmarshal(raw, &classes) != nil || len(classes) == 0 {
		return "", 0, errors.New("invalid classes")
	}
	var total int32
	parts := make([]string, 0, len(classes))
	for _, classRaw := range classes {
		var class map[string]json.RawMessage
		if json.Unmarshal(classRaw, &class) != nil || class == nil {
			return "", 0, errors.New("invalid class")
		}
		var definition map[string]json.RawMessage
		if raw, ok := class["definition"]; !ok || json.Unmarshal(raw, &definition) != nil || definition == nil {
			return "", 0, errors.New("invalid class definition")
		}
		var name string
		if raw, ok := definition["name"]; !ok || json.Unmarshal(raw, &name) != nil || strings.TrimSpace(name) == "" {
			return "", 0, errors.New("invalid class name")
		}
		var number json.Number
		if raw, ok := class["level"]; !ok || decodeNumber(raw, &number) != nil {
			return "", 0, errors.New("invalid class level")
		}
		parsedLevel, err := strconv.ParseInt(number.String(), 10, 32)
		if err != nil || parsedLevel < 1 || parsedLevel > 20 {
			return "", 0, errors.New("invalid class")
		}
		level := int32(parsedLevel)
		total += level
		if total > 20 {
			return "", 0, errors.New("invalid total level")
		}
		parts = append(parts, fmt.Sprintf("%s %d", name, level))
	}
	return strings.Join(parts, ", "), total, nil
}

func parseDdbSpecies(raw json.RawMessage) (string, error) {
	var race map[string]json.RawMessage
	if len(raw) == 0 || json.Unmarshal(raw, &race) != nil || race == nil {
		return "", errors.New("invalid race")
	}
	if value, ok := race["fullName"]; ok && string(value) != "null" {
		var name string
		if json.Unmarshal(value, &name) != nil || strings.TrimSpace(name) == "" {
			return "", errors.New("invalid race name")
		}
		return name, nil
	}
	var baseName string
	if value, ok := race["baseName"]; !ok || json.Unmarshal(value, &baseName) != nil || strings.TrimSpace(baseName) == "" {
		return "", errors.New("invalid base race name")
	}
	return baseName, nil
}

func parseDdbBackground(raw json.RawMessage) (*string, error) {
	var background map[string]json.RawMessage
	if len(raw) == 0 || json.Unmarshal(raw, &background) != nil || background == nil {
		return nil, errors.New("invalid background")
	}
	if definitionRaw, ok := background["definition"]; ok && string(definitionRaw) != "null" {
		var definition map[string]json.RawMessage
		if json.Unmarshal(definitionRaw, &definition) != nil || definition == nil {
			return nil, errors.New("invalid background definition")
		}
		if value, ok := definition["name"]; ok && string(value) != "null" {
			var name string
			if json.Unmarshal(value, &name) != nil {
				return nil, errors.New("invalid background name")
			}
			if strings.TrimSpace(name) != "" {
				return &name, nil
			}
		}
	}
	var customName *string
	value, ok := background["customBackground"]
	if !ok || (string(value) != "null" && json.Unmarshal(value, &customName) != nil) || (customName != nil && strings.TrimSpace(*customName) == "") {
		return nil, errors.New("invalid custom background")
	}
	return customName, nil
}

func optionalInt32(raw json.RawMessage) *int32 {
	if len(raw) == 0 || string(raw) == "null" {
		return nil
	}
	var number json.Number
	if decodeNumber(raw, &number) != nil {
		return nil
	}
	value, err := strconv.ParseInt(number.String(), 10, 32)
	if err != nil || value < 0 {
		return nil
	}
	result := int32(value)
	return &result
}

func parseDdbProficiencies(raw json.RawMessage) ([]DDBProficiencyView, error) {
	if len(raw) == 0 || string(raw) == "null" {
		return []DDBProficiencyView{}, nil
	}
	var groups map[string]json.RawMessage
	if json.Unmarshal(raw, &groups) != nil || groups == nil {
		return nil, errors.New("invalid modifiers")
	}
	rows := 0
	selected := make(map[string]DDBProficiencyView)
	for _, groupRaw := range groups {
		var values []json.RawMessage
		if json.Unmarshal(groupRaw, &values) != nil || values == nil {
			return nil, errors.New("invalid modifier group")
		}
		rows += len(values)
		if rows > ddbMaxModifierRows {
			return nil, errors.New("too many modifiers")
		}
		for _, valueRaw := range values {
			var value map[string]json.RawMessage
			if json.Unmarshal(valueRaw, &value) != nil || value == nil {
				return nil, errors.New("invalid modifier")
			}
			var kind string
			if raw, ok := value["type"]; !ok || json.Unmarshal(raw, &kind) != nil {
				return nil, errors.New("invalid modifier type")
			}
			var isGranted bool
			rawGrant, ok := value["isGranted"]
			if !ok || (string(bytes.TrimSpace(rawGrant)) != "true" && string(bytes.TrimSpace(rawGrant)) != "false") || json.Unmarshal(rawGrant, &isGranted) != nil {
				return nil, errors.New("invalid modifier grant")
			}
			if !isGranted || (kind != "proficiency" && kind != "language") {
				continue
			}
			var friendlyName string
			if raw, ok := value["friendlySubtypeName"]; !ok || json.Unmarshal(raw, &friendlyName) != nil {
				return nil, errors.New("invalid proficiency name")
			}
			name := strings.TrimSpace(friendlyName)
			if name == "" {
				return nil, errors.New("invalid proficiency name")
			}
			item := DDBProficiencyView{Kind: kind, Name: name}
			selected[item.Kind+"\x00"+item.Name] = item
			if len(selected) > ddbMaxProficiencies {
				return nil, errors.New("too many proficiencies")
			}
		}
	}
	result := make([]DDBProficiencyView, 0, len(selected))
	for _, value := range selected {
		result = append(result, value)
	}
	sort.Slice(result, func(i, j int) bool {
		if result[i].Kind == result[j].Kind {
			return result[i].Name < result[j].Name
		}
		return result[i].Kind < result[j].Kind
	})
	return result, nil
}
