package login

import (
	"fmt"
	"strings"

	"github.com/nyaruka/phonenumbers"
)

// NormalizePhone 按 nation（用户选择的地区码，ISO 3166-1 alpha-2）在业务层归一化为 E.164。
// 基于 libphonenumber（nyaruka/phonenumbers）：剥干线前缀（GB 的 07…→+447…）、分隔符容忍、
// 按地区元数据校验号码模式/长度（号段规则随上游元数据更新，无需自维护）。
// parse 失败或校验不通过即拒绝——唯一约束防的是异形同号，错误形状不得入库。
func NormalizePhone(nation, raw string) (string, error) {
	nation = strings.ToUpper(strings.TrimSpace(nation))
	num, err := phonenumbers.Parse(strings.TrimSpace(raw), nation)
	if err != nil {
		return "", EBadRequest("invalid phone for " + nation)
	}
	if !phonenumbers.IsValidNumber(num) {
		return "", EBadRequest("invalid phone for " + nation)
	}
	e164 := phonenumbers.Format(num, phonenumbers.E164)
	if len(e164) <= 1 {
		return "", EBadRequest("invalid phone")
	}
	return e164, nil
}

// NormalizeEmail 邮箱 lower 归一化 + 粗格式校验。
func NormalizeEmail(raw string) (string, error) {
	e := strings.ToLower(strings.TrimSpace(raw))
	at := strings.LastIndex(e, "@")
	if at <= 0 || at == len(e)-1 || strings.ContainsAny(e, " \t") || strings.Count(e, "@") != 1 {
		return "", EBadRequest("invalid email")
	}
	return e, nil
}

// MaskIdentifier 入库/入事件前脱敏：138****1234 / ab***@domain.com。
// 完整手机号/邮箱不进事件与审计表（PIPL）。
func MaskIdentifier(v string) string {
	at := strings.LastIndex(v, "@")
	if at > 0 { // 邮箱
		name := v[:at]
		keep := 2
		if len(name) < keep {
			keep = len(name)
		}
		return fmt.Sprintf("%s***%s", name[:keep], v[at:])
	}
	digits := make([]rune, 0, len(v))
	for _, r := range v {
		if r >= '0' && r <= '9' {
			digits = append(digits, r)
		}
	}
	if len(digits) < 7 {
		return "***"
	}
	return fmt.Sprintf("%s****%s", string(digits[:3]), string(digits[len(digits)-4:]))
}
