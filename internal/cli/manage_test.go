package cli

import (
	"bufio"
	"io"
	"net/http"
	"strings"
	"testing"
)

func TestHansVersion(t *testing.T) {
	current, ok := parseHansVersion("v0.5.1")
	if !ok {
		t.Fatal("stable version rejected")
	}
	for _, tag := range []string{"v0.5.10", "0.6.0", "v1.0.0"} {
		latest, ok := parseHansVersion(tag)
		if !ok || !current.olderThan(latest) {
			t.Errorf("%q should be newer than v0.5.1", tag)
		}
	}
	for _, tag := range []string{"dev", "v0.5", "v0.5.01", "v0.5.2-rc.1", "v0.5.+2", "v0.5.18446744073709551616"} {
		if _, ok := parseHansVersion(tag); ok {
			t.Errorf("invalid stable version %q accepted", tag)
		}
	}
	if current.olderThan(current) {
		t.Fatal("a version cannot be newer than itself")
	}
}

func TestLatestHansRelease(t *testing.T) {
	for _, tc := range []struct {
		name   string
		status int
		body   string
		tag    string
	}{
		{"stable", 200, `{"tag_name":"v0.5.2","html_url":"https://other.example"}`, "v0.5.2"},
		{"prerelease", 200, `{"tag_name":"v0.5.2","prerelease":true}`, ""},
		{"draft", 200, `{"tag_name":"v0.5.2","draft":true}`, ""},
		{"malformed", 200, `{"tag_name":`, ""},
		{"oversize", 200, strings.Repeat(" ", (1<<20)+1), ""},
		{"rate limited", 403, "forbidden", ""},
		{"redirect", 302, "", ""},
	} {
		t.Run(tc.name, func(t *testing.T) {
			client := hansReleaseClient()
			client.Transport = hansRoundTripFunc(func(req *http.Request) (*http.Response, error) {
				if req.Method != http.MethodGet || req.URL.String() != hansReleaseAPI || req.Header.Get("Authorization") != "" || req.Body != nil {
					t.Errorf("expected a public read-only request to the project releases, got %s %s", req.Method, req.URL)
				}
				return &http.Response{
					StatusCode: tc.status,
					Header:     http.Header{"Location": {"https://other.example/release"}},
					Body:       io.NopCloser(strings.NewReader(tc.body)),
				}, nil
			})
			got, err := latestHansRelease(client)
			if got != tc.tag || (err != nil) != (tc.tag == "") {
				t.Fatalf("got tag %q, error %v, want tag %q", got, err, tc.tag)
			}
		})
	}
}

func TestConfirmHansRemovalRequiresBothSteps(t *testing.T) {
	for _, tc := range []struct {
		input string
		want  bool
	}{
		{"\nUNINSTALL\n", false},
		{"1\n\n", false},
		{"1\nuninstall\n", false},
		{"1\nUNINSTALL", false},
		{"1\nUNINSTALL\n", true},
	} {
		got := confirmHansRemoval(bufio.NewReader(strings.NewReader(tc.input)))
		if got != tc.want {
			t.Errorf("%q: got %v, want %v", tc.input, got, tc.want)
		}
	}
}

type hansRoundTripFunc func(*http.Request) (*http.Response, error)

func (transport hansRoundTripFunc) RoundTrip(req *http.Request) (*http.Response, error) {
	return transport(req)
}
