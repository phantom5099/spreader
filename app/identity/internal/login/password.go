package login

import (
	"crypto/rand"
	"crypto/subtle"
	"encoding/base64"
	"errors"
	"fmt"
	"strings"

	"golang.org/x/crypto/argon2"
)

// Argon2id 参数：OWASP 现行推荐档 m=19456,t=2,p=1；PHC 自描述串存储，升级不需数据迁移。
const (
	argonTime    = 2
	argonMemory  = 19456 // KiB
	argonThreads = 1
	argonKeyLen  = 32
	argonSaltLen = 16
)

// Pepper 口令哈希 pepper（来自 env，仓库零秘密）。空串允许（本地开发）。
type Pepper string

// HashPassword 生成 Argon2id PHC 串：$argon2id$v=19$m=19456,t=2,p=1$<salt>$<hash>。
func (p Pepper) HashPassword(password string) (string, error) {
	salt := make([]byte, argonSaltLen)
	if _, err := rand.Read(salt); err != nil {
		return "", fmt.Errorf("rand salt: %w", err)
	}
	key := argon2.IDKey([]byte(password+string(p)), salt, argonTime, argonMemory, argonThreads, argonKeyLen)
	return fmt.Sprintf("$argon2id$v=%d$m=%d,t=%d,p=%d$%s$%s",
		argon2.Version, argonMemory, argonTime, argonThreads,
		base64.RawStdEncoding.EncodeToString(salt),
		base64.RawStdEncoding.EncodeToString(key)), nil
}

var errMismatch = errors.New("password mismatch")

// VerifyPassword 恒定时间比对 PHC 串；参数从串内自读，升级不需迁移。
func (p Pepper) VerifyPassword(password, phc string) error {
	parts := strings.Split(phc, "$")
	// ["", "argon2id", "v=19", "m=...,t=...,p=...", salt, hash]
	if len(parts) != 6 || parts[1] != "argon2id" {
		return errMismatch
	}
	var version int
	if _, err := fmt.Sscanf(parts[2], "v=%d", &version); err != nil {
		return errMismatch
	}
	var m uint32
	var t uint32
	var threads uint8
	if _, err := fmt.Sscanf(parts[3], "m=%d,t=%d,p=%d", &m, &t, &threads); err != nil {
		return errMismatch
	}
	salt, err := base64.RawStdEncoding.DecodeString(parts[4])
	if err != nil {
		return errMismatch
	}
	want, err := base64.RawStdEncoding.DecodeString(parts[5])
	if err != nil {
		return errMismatch
	}
	got := argon2.IDKey([]byte(password+string(p)), salt, t, m, threads, uint32(len(want)))
	if subtle.ConstantTimeCompare(got, want) != 1 {
		return errMismatch
	}
	return nil
}

// DummyHashPHC 预生成 dummy 哈希：账号不存在也跑等价耗时校验，抹平响应时序防枚举。
func (p Pepper) DummyHashPHC() string {
	// 固定盐的合法 PHC 串（仅耗时垫底用，绝不放真实口令）。
	return "$argon2id$v=19$m=19456,t=2,p=1$ZHVtbXlzYWx0ZHVtbXk$2lF5FRtSCv9rsEClMTnpnFzTpFbec9WVPJ4KLDL9bHo"
}

// weakPasswords 内置 Top 弱口令黑名单（纯内存查表，0 外部依赖）。
// 覆盖泄露语料头部高频口令；规模化后接 HIBP 语料或下载版全量库。
var weakPasswords = map[string]struct{}{
	"123456": {}, "password": {}, "123456789": {}, "12345678": {}, "12345": {},
	"qwerty": {}, "abc123": {}, "111111": {}, "123123": {}, "admin": {},
	"password1": {}, "1234567890": {}, "qwerty123": {}, "000000": {}, "iloveyou": {},
	"666666": {}, "888888": {}, "a123456": {}, "123qwe": {}, "admin123": {},
	"1234qwer": {}, "root": {}, "passw0rd": {}, "1qaz2wsx": {}, "qwertyuiop": {},
	"monkey": {}, "dragon": {}, "master": {}, "sunshine": {}, "princess": {},
	"letmein": {}, "welcome": {}, "login": {}, "football": {}, "baseball": {},
	"starwars": {}, "shadow": {}, "michael": {}, "ninja": {}, "asdfghjkl": {},
}

// WeakPassword 判断候选口令是否命中内置弱口令黑名单（注册/设密路径调用；登录路径不查）。
func (p Pepper) WeakPassword(password string) bool {
	_, ok := weakPasswords[strings.ToLower(password)]
	return ok
}

// IsMismatch 统一判断口令不匹配。
func IsMismatch(err error) bool { return errors.Is(err, errMismatch) }
