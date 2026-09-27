using System.Collections.Generic;
using UnityEngine;

namespace BlockfireVR
{
    // Builds blocky models (mobs, guns, hands) out of coloured boxes merged
    // into one mesh. Each face is shaded like the world, lit from above.
    public class Boxes
    {
        readonly List<Vector3> verts = new List<Vector3>();
        readonly List<Vector2> uvs = new List<Vector2>();
        readonly List<Color32> cols = new List<Color32>();
        readonly List<int> tris = new List<int>();

        static readonly float[] Light = { 0.82f, 0.82f, 0.7f, 0.7f, 1f, 0.55f };

        // A box centred on c, size s, rotated by rot (optional).
        public Boxes Add(Vector3 c, Vector3 s, Color32 color)
        {
            return Add(c, s, color, Quaternion.identity);
        }

        public Boxes Add(Vector3 c, Vector3 s, Color32 color, Quaternion rot)
        {
            Vector3 h = s * 0.5f;
            // +x, -x, +z, -z, +y, -y
            Vector3[] n = { Vector3.right, Vector3.left, Vector3.forward, Vector3.back, Vector3.up, Vector3.down };
            Vector3[] u = { Vector3.back, Vector3.forward, Vector3.right, Vector3.left, Vector3.right, Vector3.right };
            Vector3[] v = { Vector3.up, Vector3.up, Vector3.up, Vector3.up, Vector3.forward, Vector3.back };
            for (int f = 0; f < 6; f++)
            {
                int b = verts.Count;
                Vector3 fc = Vector3.Scale(n[f], h);
                Vector3 fu = Vector3.Scale(u[f], h);
                Vector3 fv = Vector3.Scale(v[f], h);
                Vector3[] p = { fc - fu - fv, fc + fu - fv, fc + fu + fv, fc - fu + fv };
                float l = Light[f];
                var shaded = new Color32((byte)(color.r * l), (byte)(color.g * l), (byte)(color.b * l), color.a);
                for (int k = 0; k < 4; k++)
                {
                    verts.Add(c + rot * p[k]);
                    uvs.Add(new Vector2(k == 1 || k == 2 ? 1 : 0, k >= 2 ? 1 : 0));
                    cols.Add(shaded);
                }
                // Clockwise from the outside.
                bool flip = Vector3.Dot(Vector3.Cross(p[1] - p[0], p[2] - p[0]), n[f]) < 0;
                if (!flip)
                {
                    tris.Add(b); tris.Add(b + 1); tris.Add(b + 2);
                    tris.Add(b); tris.Add(b + 2); tris.Add(b + 3);
                }
                else
                {
                    tris.Add(b); tris.Add(b + 2); tris.Add(b + 1);
                    tris.Add(b); tris.Add(b + 3); tris.Add(b + 2);
                }
            }
            return this;
        }

        public Mesh ToMesh(string name)
        {
            var m = new Mesh();
            m.name = name;
            m.SetVertices(verts);
            m.SetUVs(0, uvs);
            m.SetColors(cols);
            m.SetTriangles(tris, 0);
            m.RecalculateBounds();
            return m;
        }

        // A new object with this mesh, as a child of parent.
        public GameObject Make(string name, Transform parent, Material mat)
        {
            var go = new GameObject(name);
            go.transform.SetParent(parent, false);
            go.AddComponent<MeshFilter>().sharedMesh = ToMesh(name);
            var mr = go.AddComponent<MeshRenderer>();
            mr.sharedMaterial = mat;
            mr.shadowCastingMode = UnityEngine.Rendering.ShadowCastingMode.Off;
            mr.receiveShadows = false;
            return go;
        }

        public static Color32 Hex(string hex)
        {
            Color c;
            ColorUtility.TryParseHtmlString(hex, out c);
            return c;
        }

        // A single block with the world's textures on it (the block in your
        // left hand).
        public static Mesh Block(byte id, float size)
        {
            var verts = new List<Vector3>();
            var uvs = new List<Vector2>();
            var cols = new List<Color32>();
            var tris = new List<int>();
            Vector3[] n = { Vector3.right, Vector3.left, Vector3.forward, Vector3.back, Vector3.up, Vector3.down };
            Vector3[] u = { Vector3.back, Vector3.forward, Vector3.right, Vector3.left, Vector3.right, Vector3.right };
            Vector3[] v = { Vector3.up, Vector3.up, Vector3.up, Vector3.up, Vector3.forward, Vector3.back };
            float h = size / 2;
            for (int f = 0; f < 6; f++)
            {
                Vector4 r = Atlas.Rect(Blocks.Tile(id, f == 4 ? 0 : f == 5 ? 2 : 1));
                int b = verts.Count;
                Vector3[] p = { (n[f] - u[f] - v[f]) * h, (n[f] + u[f] - v[f]) * h, (n[f] + u[f] + v[f]) * h, (n[f] - u[f] + v[f]) * h };
                byte l = (byte)(255 * Light[f]);
                for (int k = 0; k < 4; k++)
                {
                    verts.Add(p[k]);
                    uvs.Add(new Vector2(k == 1 || k == 2 ? r.z : r.x, k >= 2 ? r.w : r.y));
                    cols.Add(new Color32(l, l, l, 255));
                }
                bool flip = Vector3.Dot(Vector3.Cross(p[1] - p[0], p[2] - p[0]), n[f]) < 0;
                if (!flip)
                {
                    tris.Add(b); tris.Add(b + 1); tris.Add(b + 2);
                    tris.Add(b); tris.Add(b + 2); tris.Add(b + 3);
                }
                else
                {
                    tris.Add(b); tris.Add(b + 2); tris.Add(b + 1);
                    tris.Add(b); tris.Add(b + 3); tris.Add(b + 2);
                }
            }
            var m = new Mesh();
            m.SetVertices(verts);
            m.SetUVs(0, uvs);
            m.SetColors(cols);
            m.SetTriangles(tris, 0);
            m.RecalculateBounds();
            return m;
        }

        // A flat square facing -z (towards whoever looks at it along +z), for
        // text panels.
        public static Mesh Quad(float w, float h)
        {
            var m = new Mesh();
            m.SetVertices(new List<Vector3> { new Vector3(-w / 2, -h / 2, 0), new Vector3(w / 2, -h / 2, 0), new Vector3(w / 2, h / 2, 0), new Vector3(-w / 2, h / 2, 0) });
            m.SetUVs(0, new List<Vector2> { new Vector2(0, 0), new Vector2(1, 0), new Vector2(1, 1), new Vector2(0, 1) });
            m.SetColors(new List<Color32> { Color.white, Color.white, Color.white, Color.white });
            // Clockwise as seen from -z.
            m.SetTriangles(new List<int> { 0, 2, 1, 0, 3, 2 }, 0);
            m.RecalculateBounds();
            return m;
        }
    }
}
