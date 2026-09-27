using UnityEngine;

namespace BlockfireVR
{
    // Little cubes that fly off things (hits, poofs, block bits) and bullet
    // tracers. Everything is made once and reused.
    public class Fx
    {
        struct Bit
        {
            public Transform t;
            public MeshRenderer r;
            public Vector3 vel;
            public float life, max, size, grav;
        }

        struct Tracer
        {
            public LineRenderer line;
            public float life;
        }

        readonly Bit[] bits = new Bit[220];
        readonly Tracer[] tracers = new Tracer[16];
        readonly MaterialPropertyBlock mpb = new MaterialPropertyBlock();
        int next, nextTracer;
        static readonly int ColorId = Shader.PropertyToID("_Color");

        public Fx(Transform parent, Material solid, Material glow)
        {
            var root = new GameObject("Effects").transform;
            root.SetParent(parent, false);
            var cube = new Boxes().Add(Vector3.zero, Vector3.one, new Color32(255, 255, 255, 255)).ToMesh("bit");
            for (int i = 0; i < bits.Length; i++)
            {
                var go = new GameObject("bit");
                go.transform.SetParent(root, false);
                go.AddComponent<MeshFilter>().sharedMesh = cube;
                var mr = go.AddComponent<MeshRenderer>();
                mr.sharedMaterial = solid;
                mr.shadowCastingMode = UnityEngine.Rendering.ShadowCastingMode.Off;
                go.SetActive(false);
                bits[i].t = go.transform;
                bits[i].r = mr;
            }
            for (int i = 0; i < tracers.Length; i++)
            {
                var go = new GameObject("tracer");
                go.transform.SetParent(root, false);
                var lr = go.AddComponent<LineRenderer>();
                lr.sharedMaterial = glow;
                lr.positionCount = 2;
                lr.startWidth = 0.025f;
                lr.endWidth = 0.012f;
                lr.useWorldSpace = true;
                lr.shadowCastingMode = UnityEngine.Rendering.ShadowCastingMode.Off;
                lr.enabled = false;
                tracers[i].line = lr;
            }
        }

        // n bits flying out from p.
        public void Burst(Vector3 p, Color32 color, int n, float speed, float size, float life = 0.7f, float up = 2f, float grav = 12f)
        {
            for (int k = 0; k < n; k++)
            {
                int i = next;
                next = (next + 1) % bits.Length;
                bits[i].vel = Random.insideUnitSphere * speed + Vector3.up * up;
                bits[i].life = bits[i].max = life * Random.Range(0.6f, 1.1f);
                bits[i].size = size * Random.Range(0.6f, 1.2f);
                bits[i].grav = grav;
                var t = bits[i].t;
                t.position = p;
                t.rotation = Random.rotation;
                t.localScale = Vector3.one * bits[i].size;
                // Slightly different shades so it looks like real bits.
                float k2 = Random.Range(0.8f, 1.1f);
                mpb.SetColor(ColorId, new Color(color.r / 255f * k2, color.g / 255f * k2, color.b / 255f * k2, 1));
                bits[i].r.SetPropertyBlock(mpb);
                t.gameObject.SetActive(true);
            }
        }

        public void Line(Vector3 a, Vector3 b, Color color)
        {
            int i = nextTracer;
            nextTracer = (nextTracer + 1) % tracers.Length;
            var line = tracers[i].line;
            line.SetPosition(0, a);
            line.SetPosition(1, b);
            line.startColor = color;
            line.endColor = new Color(color.r, color.g, color.b, 0.2f);
            line.enabled = true;
            tracers[i].life = 0.06f;
        }

        public void Update(float dt)
        {
            for (int i = 0; i < bits.Length; i++)
            {
                if (bits[i].life <= 0) continue;
                bits[i].life -= dt;
                if (bits[i].life <= 0)
                {
                    bits[i].t.gameObject.SetActive(false);
                    continue;
                }
                bits[i].vel.y -= bits[i].grav * dt;
                bits[i].t.position += bits[i].vel * dt;
                bits[i].t.localScale = Vector3.one * bits[i].size * Mathf.Clamp01(bits[i].life / bits[i].max * 1.5f);
            }
            for (int i = 0; i < tracers.Length; i++)
            {
                if (tracers[i].life <= 0) continue;
                tracers[i].life -= dt;
                if (tracers[i].life <= 0) tracers[i].line.enabled = false;
            }
        }
    }
}
