package character

import (
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net"
	"net/http"
	"net/http/cookiejar"
	"net/url"
	"reflect"
	"strings"
	"testing"
	"time"
)

type ddbRoundTripFunc func(*http.Request) (*http.Response, error)

func (f ddbRoundTripFunc) RoundTrip(request *http.Request) (*http.Response, error) {
	return f(request)
}

func TestPhase3TaskC08Acceptance(t *testing.T) {
	payload, capture := readDdbCapture(t)
	parsed, err := parseDdbPayload(payload, "152579009")
	if err != nil {
		t.Fatalf("captured response should parse: %v", err)
	}
	if parsed.Level == nil || *parsed.Level != 1 || parsed.XP == nil || *parsed.XP != 0 || parsed.Species == nil || *parsed.Species != "Goliath" || parsed.Classes == nil || *parsed.Classes != "Barbarian 1" || parsed.Background == nil || *parsed.Background != "Soldier" || parsed.ArmorClass != nil || parsed.MaxHP != nil {
		t.Fatalf("captured v1 projection differs from the dated contract: %#v", parsed)
	}
	want := []DDBProficiencyView{
		{Kind: "language", Name: "Common"},
		{Kind: "proficiency", Name: "Constitution Saving Throws"},
		{Kind: "proficiency", Name: "Light Armor"},
		{Kind: "proficiency", Name: "Martial Weapons"},
		{Kind: "proficiency", Name: "Medium Armor"},
		{Kind: "proficiency", Name: "Shields"},
		{Kind: "proficiency", Name: "Simple Weapons"},
		{Kind: "proficiency", Name: "Strength Saving Throws"},
	}
	if !reflect.DeepEqual(parsed.Proficiencies, want) {
		t.Fatalf("captured proficiencies = %#v, want %#v", parsed.Proficiencies, want)
	}
	if capture.Capture.CaptureUTC != "2026-10-14T13:00:39.738329+00:00" {
		t.Fatalf("fixture capture date changed unexpectedly: %q", capture.Capture.CaptureUTC)
	}

	unknownExtra := bytes.Replace(payload, []byte(`"data": {`), []byte(`"ignoredFutureField": {"anything": true}, "data": {`), 1)
	if _, err := parseDdbPayload(unknownExtra, "152579009"); err != nil {
		t.Fatalf("unknown unused fields should be ignored: %v", err)
	}
	fallbacks := withDdbOptionalFallbacks(t, payload)
	if snapshot, err := parseDdbPayload(fallbacks, "152579009"); err != nil || snapshot.Species == nil || *snapshot.Species != "Goliath" || snapshot.Background == nil || *snapshot.Background != "Custom background" {
		t.Fatalf("explicit species/background fallbacks should project: species=%v background=%v err=%v", snapshot.Species, snapshot.Background, err)
	}

	for name, changed := range map[string][]byte{
		"missing current xp":     bytes.Replace(payload, []byte(`"currentXp": 0,`), nil, 1),
		"wrong current xp type":  bytes.Replace(payload, []byte(`"currentXp": 0,`), []byte(`"currentXp": "0",`), 1),
		"wrong class level type": bytes.Replace(payload, []byte(`"level": 1`), []byte(`"level": "1"`), 1),
		"class field alias":      bytes.Replace(payload, []byte(`"level": 1`), []byte(`"LEVEL": 1`), 1),
		"modifier field alias":   bytes.Replace(payload, []byte(`"isGranted": true`), []byte(`"isgranted": true`), 1),
		"wrong race name type":   bytes.Replace(payload, []byte(`"fullName": "Goliath"`), []byte(`"fullName": 17`), 1),
		"mismatched identity":    bytes.Replace(payload, []byte(`"id": 152579009`), []byte(`"id": 152579010`), 1),
		"failed envelope":        bytes.Replace(payload, []byte(`"success": true`), []byte(`"success": false`), 1),
	} {
		t.Run(name, func(t *testing.T) {
			if _, err := parseDdbPayload(changed, "152579009"); err == nil {
				t.Fatal("malformed or mismatched payload was accepted")
			}
		})
	}

	synthetic := bytes.Replace(payload, []byte(`"currentXp": 0,`), []byte(`"armorClass": 13, "currentXp": 0,`), 1)
	synthetic = bytes.Replace(synthetic, []byte(`"overrideHitPoints": null`), []byte(`"overrideHitPoints": 14`), 1)
	snapshot, err := parseDdbPayload(synthetic, "152579009")
	if err != nil || snapshot.ArmorClass == nil || *snapshot.ArmorClass != 13 || snapshot.MaxHP == nil || *snapshot.MaxHP != 14 {
		var armorClass, maxHP *int32
		if snapshot.ArmorClass != nil {
			armorClass = snapshot.ArmorClass
		}
		if snapshot.MaxHP != nil {
			maxHP = snapshot.MaxHP
		}
		t.Fatalf("explicit synthetic delta should project direct values: armorClass=%v maxHP=%v err=%v", armorClass, maxHP, err)
	}

	clientInput := withCommonGrant(t, payload, false)
	dedupInput := addDuplicateGrantedProficiency(t, payload)
	grants, err := parseDdbPayload(clientInput, "152579009")
	if err != nil || containsDdbProficiency(grants.Proficiencies, "language", "Common") {
		t.Fatalf("isGranted=false must not create a proficiency: %#v err=%v", grants.Proficiencies, err)
	}
	deduped, err := parseDdbPayload(dedupInput, "152579009")
	if err != nil || countDdbProficiency(deduped.Proficiencies, "language", "Common") != 1 {
		t.Fatalf("duplicate (kind,name) grants should collapse: %#v err=%v", deduped.Proficiencies, err)
	}
	for name, grant := range map[string]any{"string": "true", "null": nil, "number": 1} {
		t.Run("wrong modifier grant type/"+name, func(t *testing.T) {
			if _, err := parseDdbPayload(withCommonGrant(t, payload, grant), "152579009"); err == nil {
				t.Fatalf("isGranted=%v was accepted", grant)
			}
		})
	}
	if jsonDepthWithin(bytes.Repeat([]byte("{"), ddbMaxJSONDepth+1), ddbMaxJSONDepth) {
		t.Fatal("JSON nesting above the contract bound was accepted")
	}
	if bounded, err := parseDdbPayload(withModifierRows(t, payload, ddbMaxModifierRows, false), "152579009"); err != nil || len(bounded.Proficiencies) != 0 {
		t.Fatalf("modifier count at the 5000-row bound should parse: count=%d err=%v", len(bounded.Proficiencies), err)
	}
	if _, err := parseDdbPayload(withModifierRows(t, payload, ddbMaxModifierRows+1, false), "152579009"); err == nil {
		t.Fatal("modifier count above 5000 was accepted")
	}
	if bounded, err := parseDdbPayload(withModifierRows(t, payload, ddbMaxProficiencies, true), "152579009"); err != nil || len(bounded.Proficiencies) != ddbMaxProficiencies {
		t.Fatalf("proficiency count at the 100-row bound should parse: count=%d err=%v", len(bounded.Proficiencies), err)
	}
	if _, err := parseDdbPayload(withModifierRows(t, payload, ddbMaxProficiencies+1, true), "152579009"); err == nil {
		t.Fatal("more than 100 projected proficiencies were accepted")
	}

	fetchTime := time.Date(2026, 10, 17, 12, 0, 0, 0, time.UTC)
	var seen *http.Request
	jar, err := cookiejar.New(nil)
	if err != nil {
		t.Fatal(err)
	}
	jar.SetCookies(&url.URL{Scheme: "https", Host: ddbProviderHost}, []*http.Cookie{{Name: "session", Value: "must-not-send"}})
	redirectSentinel := errors.New("caller redirect policy")
	callerClient := &http.Client{Transport: ddbRoundTripFunc(func(request *http.Request) (*http.Response, error) {
		seen = request.Clone(request.Context())
		return ddbResponse(http.StatusOK, payload, nil), nil
	}), Jar: jar, Timeout: time.Second, CheckRedirect: func(*http.Request, []*http.Request) error { return redirectSentinel }}
	client, err := NewDdbClient(callerClient, func() time.Time { return fetchTime })
	if err != nil {
		t.Fatal(err)
	}
	if client.Client == callerClient || callerClient.Timeout != time.Second || callerClient.Jar != jar || !errors.Is(callerClient.CheckRedirect(nil, nil), redirectSentinel) {
		t.Fatal("constructor changed the supplied client instead of cloning it")
	}
	if client.Client.Timeout != ddbRequestTimeout || client.Client.Jar != nil {
		t.Fatal("cloned client did not enforce its request policy")
	}
	result, provenance, err := client.Fetch(context.Background(), "https://www.dndbeyond.com/characters/152579009?ignored=yes")
	if code := ddbErrorCode(err); code != DdbErrorInvalid {
		t.Fatalf("query-bearing character URL error code = %q, want INVALID", code)
	}
	if seen != nil {
		t.Fatal("invalid URL reached the transport")
	}
	result, provenance, err = client.Fetch(context.Background(), "https://www.dndbeyond.com/characters/152579009")
	if err != nil {
		t.Fatalf("captured fetch failed: %v", err)
	}
	if seen == nil || seen.URL.String() != "https://character-service.dndbeyond.com/character/v5/character/152579009" || seen.Header.Get("Authorization") != "" || seen.Header.Get("Cookie") != "" {
		t.Fatalf("fetch did not use the admitted anonymous endpoint: request=%#v", seen)
	}
	if result.Level == nil || *result.Level != 1 || provenance.SourceURL != seen.URL.String() || provenance.FetchedAt != fetchTime || provenance.PayloadSHA256 != capture.Reduction.ReducedSHA256 || provenance.ParserVersion != "v1" || provenance.FixtureCaptureID != nil {
		t.Fatalf("unexpected fetched projection or provenance: %#v %#v", result, provenance)
	}

	for _, unsafe := range []string{
		"http://www.dndbeyond.com/characters/152579009",
		"https://www.dndbeyond.com.evil.invalid/characters/152579009",
		"https://user@www.dndbeyond.com/characters/152579009",
		"https://www.dndbeyond.com/characters/0",
		"https://www.dndbeyond.com/characters/152579009/extra",
	} {
		if _, _, err := client.Fetch(context.Background(), unsafe); ddbErrorCode(err) != DdbErrorInvalid {
			t.Errorf("unsafe URL %q should return INVALID, got %v", unsafe, err)
		}
	}

	if _, err := NewDdbClient(nil, func() time.Time { return fetchTime }); err == nil {
		t.Fatal("nil client accepted")
	}
	if _, err := NewDdbClient(&http.Client{}, nil); err == nil {
		t.Fatal("nil clock accepted")
	}
}

func TestDdbSnapshotPayloadContainsOnlyV1Projection(t *testing.T) {
	payload, _ := readDdbCapture(t)
	privateBody := bytes.Replace(payload, []byte(`"data": {`), []byte(`"data": {"privateSentinel": "never-persist-this",`), 1)
	if bytes.Equal(privateBody, payload) {
		t.Fatal("test payload did not receive the private sentinel")
	}
	fetchedAt := time.Date(2026, 10, 17, 12, 0, 0, 0, time.UTC)
	client, err := NewDdbClient(&http.Client{Transport: ddbRoundTripFunc(func(*http.Request) (*http.Response, error) {
		return ddbResponse(http.StatusOK, privateBody, nil), nil
	})}, func() time.Time { return fetchedAt })
	if err != nil {
		t.Fatal(err)
	}
	snapshot, provenance, err := client.Fetch(context.Background(), "https://www.dndbeyond.com/characters/152579009")
	if err != nil {
		t.Fatalf("fetch with unknown provider field failed: %v", err)
	}
	if bytes.Contains(snapshot.Payload, []byte("privateSentinel")) || bytes.Contains(snapshot.Payload, []byte("never-persist-this")) {
		t.Fatalf("provider-only private data escaped into the snapshot payload: %s", snapshot.Payload)
	}
	wantHash := sha256.Sum256(privateBody)
	if provenance.PayloadSHA256 != fmt.Sprintf("%x", wantHash) {
		t.Fatalf("payload provenance hash=%s, want raw fetched body hash %x", provenance.PayloadSHA256, wantHash)
	}
	var projection map[string]json.RawMessage
	if err := json.Unmarshal(snapshot.Payload, &projection); err != nil {
		t.Fatalf("snapshot payload is not JSON: %v", err)
	}
	wantFields := []string{"level", "xp", "armorClass", "maxHp", "species", "classes", "background", "proficiencies"}
	if len(projection) != len(wantFields) {
		t.Fatalf("snapshot fields=%v, want only complete v1 projection fields %v", projection, wantFields)
	}
	for _, field := range wantFields {
		if _, ok := projection[field]; !ok {
			t.Errorf("snapshot projection is missing %q", field)
		}
	}
}

func TestDdbClientRedirectAndPublicAddressBoundaries(t *testing.T) {
	production, err := NewProductionDdbHTTPClient()
	if err != nil {
		t.Fatal(err)
	}
	transport, ok := production.Transport.(*http.Transport)
	if !ok || transport.Proxy != nil || transport.DialContext == nil || transport.TLSClientConfig == nil || transport.TLSClientConfig.ServerName != ddbProviderHost || production.Timeout != ddbRequestTimeout {
		t.Fatal("production transport is missing its fixed-origin DNS, TLS, or timeout policy")
	}
	production.CloseIdleConnections()

	payload, _ := readDdbCapture(t)
	for _, test := range []struct {
		name      string
		location  string
		wantCalls int
		wantErr   DdbErrorCode
	}{
		{name: "same authority bounded redirect", location: ddbProviderOrigin + "/character/v5/character/152579009", wantCalls: 2},
		{name: "cross authority redirect rejected", location: "https://169.254.169.254/latest/meta-data/", wantCalls: 1, wantErr: DdbErrorProviderHTTP},
	} {
		t.Run(test.name, func(t *testing.T) {
			calls := 0
			client, err := NewDdbClient(&http.Client{Transport: ddbRoundTripFunc(func(request *http.Request) (*http.Response, error) {
				calls++
				if calls == 1 {
					return ddbResponse(http.StatusFound, nil, map[string]string{"Location": test.location}), nil
				}
				return ddbResponse(http.StatusOK, payload, nil), nil
			})}, time.Now)
			if err != nil {
				t.Fatal(err)
			}
			_, _, err = client.Fetch(context.Background(), "https://www.dndbeyond.com/characters/152579009")
			if calls != test.wantCalls || ddbErrorCode(err) != test.wantErr {
				t.Fatalf("calls=%d err=%v, want calls=%d safeError=%q", calls, err, test.wantCalls, test.wantErr)
			}
		})
	}

	for address, want := range map[string]bool{
		"8.8.8.8":              true,
		"127.0.0.1":            false,
		"10.0.0.1":             false,
		"169.254.169.254":      false,
		"100.64.0.1":           false,
		"192.0.2.1":            false,
		"::1":                  false,
		"fd00::254":            false,
		"2001:db8::1":          false,
		"2001:4860:4860::8888": true,
	} {
		if got := publicDdbIP(net.ParseIP(address)); got != want {
			t.Errorf("publicDdbIP(%q)=%v, want %v", address, got, want)
		}
	}
}

func TestDdbFetchBoundsResponsesAndKeepsErrorsOpaque(t *testing.T) {
	for _, test := range []struct {
		name      string
		response  func(*http.Request) (*http.Response, error)
		wantCode  DdbErrorCode
		wantCalls int
	}{
		{name: "oversized body", response: func(*http.Request) (*http.Response, error) {
			return ddbResponse(http.StatusOK, bytes.Repeat([]byte("x"), ddbMaxResponseBytes+1), nil), nil
		}, wantCode: DdbErrorPayloadDrift, wantCalls: 1},
		{name: "provider error body stays private", response: func(*http.Request) (*http.Response, error) {
			return ddbResponse(http.StatusServiceUnavailable, []byte("provider secret response"), nil), nil
		}, wantCode: DdbErrorProviderHTTP, wantCalls: 1},
		{name: "redirect count bounded", response: func(*http.Request) (*http.Response, error) {
			return ddbResponse(http.StatusFound, nil, map[string]string{"Location": ddbProviderOrigin + "/again"}), nil
		}, wantCode: DdbErrorProviderHTTP, wantCalls: ddbMaxRedirects + 1},
	} {
		t.Run(test.name, func(t *testing.T) {
			calls := 0
			client, err := NewDdbClient(&http.Client{Transport: ddbRoundTripFunc(func(request *http.Request) (*http.Response, error) {
				calls++
				return test.response(request)
			})}, time.Now)
			if err != nil {
				t.Fatal(err)
			}
			_, _, err = client.Fetch(context.Background(), "https://www.dndbeyond.com/characters/152579009")
			if code := ddbErrorCode(err); code != test.wantCode || calls != test.wantCalls {
				t.Fatalf("safeError=%q calls=%d, want %q and %d calls", code, calls, test.wantCode, test.wantCalls)
			}
			if err != nil && strings.Contains(err.Error(), "secret") {
				t.Fatal("provider response body escaped through the error")
			}
		})
	}
}

func ddbResponse(status int, body []byte, headers map[string]string) *http.Response {
	response := &http.Response{StatusCode: status, Header: make(http.Header), Body: io.NopCloser(bytes.NewReader(body))}
	for name, value := range headers {
		response.Header.Set(name, value)
	}
	return response
}

func ddbErrorCode(err error) DdbErrorCode {
	var ddbErr DdbError
	if errors.As(err, &ddbErr) {
		return ddbErr.Code
	}
	return ""
}

func containsDdbProficiency(values []DDBProficiencyView, kind, name string) bool {
	return countDdbProficiency(values, kind, name) > 0
}

func countDdbProficiency(values []DDBProficiencyView, kind, name string) int {
	count := 0
	for _, value := range values {
		if value.Kind == kind && value.Name == name {
			count++
		}
	}
	return count
}

func addDuplicateGrantedProficiency(t *testing.T, payload []byte) []byte {
	t.Helper()
	var envelope map[string]any
	if err := json.Unmarshal(payload, &envelope); err != nil {
		t.Fatal(err)
	}
	data := envelope["data"].(map[string]any)
	modifiers := data["modifiers"].(map[string]any)
	duplicate := map[string]any{"friendlySubtypeName": "Common", "isGranted": true, "subType": "common-copy", "type": "language"}
	modifiers["class"] = append(modifiers["class"].([]any), duplicate)
	encoded, err := json.Marshal(envelope)
	if err != nil {
		t.Fatal(err)
	}
	return encoded
}

func withCommonGrant(t *testing.T, payload []byte, grant any) []byte {
	t.Helper()
	var envelope map[string]any
	if err := json.Unmarshal(payload, &envelope); err != nil {
		t.Fatal(err)
	}
	data := envelope["data"].(map[string]any)
	modifiers := data["modifiers"].(map[string]any)
	race := modifiers["race"].([]any)
	for _, raw := range race {
		entry := raw.(map[string]any)
		if entry["friendlySubtypeName"] == "Common" {
			entry["isGranted"] = grant
		}
	}
	encoded, err := json.Marshal(envelope)
	if err != nil {
		t.Fatal(err)
	}
	return encoded
}

func withModifierRows(t *testing.T, payload []byte, count int, granted bool) []byte {
	t.Helper()
	var envelope map[string]any
	if err := json.Unmarshal(payload, &envelope); err != nil {
		t.Fatal(err)
	}
	data := envelope["data"].(map[string]any)
	rows := make([]any, count)
	for index := range rows {
		rows[index] = map[string]any{
			"friendlySubtypeName": fmt.Sprintf("Name %05d", index),
			"isGranted":           granted,
			"type":                "proficiency",
		}
	}
	data["modifiers"] = map[string]any{"synthetic": rows}
	encoded, err := json.Marshal(envelope)
	if err != nil {
		t.Fatal(err)
	}
	return encoded
}

func withDdbOptionalFallbacks(t *testing.T, payload []byte) []byte {
	t.Helper()
	var envelope map[string]any
	if err := json.Unmarshal(payload, &envelope); err != nil {
		t.Fatal(err)
	}
	data := envelope["data"].(map[string]any)
	race := data["race"].(map[string]any)
	race["fullName"] = nil
	background := data["background"].(map[string]any)
	background["definition"] = nil
	background["customBackground"] = "Custom background"
	encoded, err := json.Marshal(envelope)
	if err != nil {
		t.Fatal(err)
	}
	return encoded
}
