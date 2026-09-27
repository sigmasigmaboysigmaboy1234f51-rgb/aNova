// Blockfire VR's one shader: a texture times the vertex colours (the
// blocks' shading and every box model's colours), a white flash for mobs
// that get hit, and fog into the sky colour far away. No lighting, so it
// is quick on a Quest. Works in the built-in renderer and in URP, and in
// both eyes (single pass instanced and multiview).
Shader "Blockfire/Voxel"
{
    Properties
    {
        _MainTex ("Texture", 2D) = "white" {}
        _Color ("Colour", Color) = (1, 1, 1, 1)
        _Flash ("Flash", Range(0, 1)) = 0
        _Cutoff ("Alpha cutoff", Range(0, 1)) = 0.02
        _Fog ("Fog (1 = on)", Float) = 1
        [HideInInspector] _SrcBlend ("Src blend", Float) = 1
        [HideInInspector] _DstBlend ("Dst blend", Float) = 0
        [HideInInspector] _ZWrite ("ZWrite", Float) = 1
    }
    SubShader
    {
        Tags { "RenderType" = "Opaque" "Queue" = "Geometry" "IgnoreProjector" = "True" }
        Pass
        {
            // No LightMode tag, so URP draws it as an unlit pass too.
            Blend [_SrcBlend] [_DstBlend]
            ZWrite [_ZWrite]
            Cull Back

            CGPROGRAM
            #pragma vertex vert
            #pragma fragment frag
            #pragma multi_compile_instancing
            #include "UnityCG.cginc"

            sampler2D _MainTex;
            float4 _MainTex_ST;
            fixed4 _Color;
            half _Flash;
            half _Cutoff;
            half _Fog;
            // Set once by the game for everything: the sky colour, and
            // where the fog starts and is thickest (in metres).
            fixed4 _BfFogColor;
            float4 _BfFog;

            struct appdata
            {
                float4 vertex : POSITION;
                float2 uv : TEXCOORD0;
                fixed4 color : COLOR;
                UNITY_VERTEX_INPUT_INSTANCE_ID
            };

            struct v2f
            {
                float4 pos : SV_POSITION;
                float2 uv : TEXCOORD0;
                fixed4 color : COLOR;
                float dist : TEXCOORD1;
                UNITY_VERTEX_OUTPUT_STEREO
            };

            v2f vert(appdata v)
            {
                v2f o;
                UNITY_SETUP_INSTANCE_ID(v);
                UNITY_INITIALIZE_OUTPUT(v2f, o);
                UNITY_INITIALIZE_VERTEX_OUTPUT_STEREO(o);
                o.pos = UnityObjectToClipPos(v.vertex);
                o.uv = TRANSFORM_TEX(v.uv, _MainTex);
                fixed4 c = v.color;
                #ifndef UNITY_COLORSPACE_GAMMA
                // Vertex colours are written as normal (sRGB) colours;
                // a Linear project needs them converted.
                c.rgb = GammaToLinearSpace(c.rgb);
                #endif
                o.color = c * _Color;
                float3 wp = mul(unity_ObjectToWorld, v.vertex).xyz;
                o.dist = distance(wp, _WorldSpaceCameraPos);
                return o;
            }

            fixed4 frag(v2f i) : SV_Target
            {
                UNITY_SETUP_STEREO_EYE_INDEX_POST_VERTEX(i);
                fixed4 c = tex2D(_MainTex, i.uv) * i.color;
                clip(c.a - _Cutoff);
                c.rgb = lerp(c.rgb, fixed3(1, 1, 1), _Flash);
                float f = saturate((i.dist - _BfFog.x) / max(_BfFog.y - _BfFog.x, 0.01));
                f *= _Fog * step(0.001, _BfFog.y);
                c.rgb = lerp(c.rgb, _BfFogColor.rgb, f);
                return c;
            }
            ENDCG
        }
    }
    Fallback Off
}
