// Package protojsoncodec 用 proto 标准 JSON（protojson）覆盖 Kratos 默认的
// "json" 编解码器。
//
// protojson 是 protobuf 官方 JSON 映射：枚举名/数字都接受，oneof 正常工作。
// 非 proto 类型回退到标准 encoding/json，行为与原来完全一致。
package protojsoncodec

import (
	"encoding/json"

	"github.com/go-kratos/kratos/v3/encoding"
	"google.golang.org/protobuf/encoding/protojson"
	"google.golang.org/protobuf/proto"
)

// Register 用 protojson 语义覆盖名为 "json" 的 codec。
// 必须在 HTTP/gRPC server 启动前调用。
func Register() {
	encoding.RegisterCodec(protoJSONCodec{})
}

type protoJSONCodec struct{}

func (protoJSONCodec) Marshal(v any) ([]byte, error) {
	if m, ok := v.(proto.Message); ok {
		// EmitUnpopulated=false：零值字段不下发，与 encoding/json 的 omitempty 习惯一致。
		return protojson.MarshalOptions{EmitUnpopulated: false}.Marshal(m)
	}
	return json.Marshal(v)
}

func (protoJSONCodec) Unmarshal(data []byte, v any) error {
	if len(data) == 0 {
		return nil
	}
	if m, ok := v.(proto.Message); ok {
		// DiscardUnknown：容忍客户端多传字段，与 encoding/json 的默认宽容行为一致。
		return protojson.UnmarshalOptions{DiscardUnknown: true}.Unmarshal(data, m)
	}
	return json.Unmarshal(data, v)
}

func (protoJSONCodec) Name() string { return "json" }
