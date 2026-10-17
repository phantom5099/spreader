package login

import "testing"

func TestHashVerifyPassword(t *testing.T) {
	p := Pepper("unit-pepper")
	phc, err := p.HashPassword("s3cret-Password!")
	if err != nil {
		t.Fatalf("hash: %v", err)
	}
	if err := p.VerifyPassword("s3cret-Password!", phc); err != nil {
		t.Fatalf("verify correct: %v", err)
	}
	if err := p.VerifyPassword("wrong", phc); !IsMismatch(err) {
		t.Fatalf("want mismatch, got %v", err)
	}
	// dummy 哈希与任意口令不匹配（仅耗时垫底）。
	if err := p.VerifyPassword("anything", p.DummyHashPHC()); !IsMismatch(err) {
		t.Fatalf("dummy should never match, got %v", err)
	}
}

func TestNormalizePhone(t *testing.T) {
	cases := []struct {
		nation, raw, want string
		wantErr           bool
	}{
		{"CN", "13800138000", "+8613800138000", false},
		{"CN", "138 0013-8000", "+8613800138000", false}, // 异形输入归一
		{"US", "4155551234", "+14155551234", false},
		{"GB", "07911 123456", "+447911123456", false}, // 干线前缀 0 必须剥掉（libphonenumber）
		{"CN", "01012345678", "+861012345678", false},  // CN 固话带区号前缀 0 同理
		{"XX", "123", "", true},
		{"CN", "", "", true},
		{"CN", "123", "", true},        // 过短：parse/模式校验拒绝（手写版会产出 +86123）
		{"CN", "1234567890", "", true}, // 形状合法但模式无效（库裁决 invalid；手写版会放行）
	}
	for _, c := range cases {
		got, err := NormalizePhone(c.nation, c.raw)
		if c.wantErr {
			if err == nil {
				t.Fatalf("NormalizePhone(%s,%s) want err", c.nation, c.raw)
			}
			continue
		}
		if err != nil {
			t.Fatalf("NormalizePhone(%s,%s): %v", c.nation, c.raw, err)
		}
		if got != c.want {
			t.Fatalf("NormalizePhone(%s,%s)=%s want %s", c.nation, c.raw, got, c.want)
		}
	}
}

func TestNormalizeEmail(t *testing.T) {
	if got, _ := NormalizeEmail("  A@B.COM "); got != "a@b.com" {
		t.Fatalf("lower normalize: %s", got)
	}
	for _, bad := range []string{"no-at", "@b.com", "a@", "a@@b.com", "a b@c.com"} {
		if _, err := NormalizeEmail(bad); err == nil {
			t.Fatalf("NormalizeEmail(%q) want err", bad)
		}
	}
}

func TestMaskIdentifier(t *testing.T) {
	// E.164 含国家码：掩码作用于全部数字（861****8000），仍不可复原。
	if got := MaskIdentifier("+8613800138000"); got != "861****8000" {
		t.Fatalf("phone mask: %s", got)
	}
	if got := MaskIdentifier("ab@cd.com"); got != "ab***@cd.com" {
		t.Fatalf("email mask: %s", got)
	}
	if got := MaskIdentifier("a@b.com"); got != "a***@b.com" {
		t.Fatalf("short email mask: %s", got)
	}
}
