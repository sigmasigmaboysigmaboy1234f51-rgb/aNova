using System.Collections.Generic;
using UnityEngine;
using UnityEngine.Rendering;

namespace BlockfireVR
{
    // The island: a 64 x 64 x 32 grid of blocks, made the same way as the web
    // version's Endless island (src/world.js), drawn as 16 x 16 chunks. One
    // block is one metre, so in VR the blocks are the size of real blocks.
    public class VoxelWorld
    {
        public const int SX = 64;
        public const int SZ = 64;
        public const int SY = 32;
        public const int Chunk = 16;
        public const int Sea = 6;

        readonly byte[] data = new byte[SX * SY * SZ];
        readonly MeshFilter[] filters = new MeshFilter[(SX / Chunk) * (SZ / Chunk)];
        readonly MeshCollider[] colliders = new MeshCollider[(SX / Chunk) * (SZ / Chunk)];
        readonly Transform root;
        readonly Material material;
        public readonly int[] heights = new int[SX * SZ];

        public VoxelWorld(Transform parent, Material mat)
        {
            material = mat;
            root = new GameObject("World").transform;
            root.SetParent(parent, false);
            for (int ci = 0; ci < filters.Length; ci++)
            {
                var go = new GameObject("Chunk " + ci);
                go.transform.SetParent(root, false);
                var mf = go.AddComponent<MeshFilter>();
                var mr = go.AddComponent<MeshRenderer>();
                mr.sharedMaterial = material;
                mr.shadowCastingMode = ShadowCastingMode.Off;
                mr.receiveShadows = false;
                var mesh = new Mesh();
                mesh.indexFormat = IndexFormat.UInt32;
                mesh.MarkDynamic();
                mf.sharedMesh = mesh;
                filters[ci] = mf;
                colliders[ci] = go.AddComponent<MeshCollider>();
            }
        }

        static int Idx(int x, int y, int z)
        {
            return (y * SZ + z) * SX + x;
        }

        public static bool InBounds(int x, int y, int z)
        {
            return x >= 0 && z >= 0 && y >= 0 && x < SX && z < SZ && y < SY;
        }

        public byte Get(int x, int y, int z)
        {
            if (y < 0) return Blocks.Bedrock;
            if (!InBounds(x, y, z)) return Blocks.Air;
            return data[Idx(x, y, z)];
        }

        public bool Solid(int x, int y, int z)
        {
            return Get(x, y, z) != Blocks.Air;
        }

        void Put(int x, int y, int z, byte id)
        {
            if (InBounds(x, y, z)) data[Idx(x, y, z)] = id;
        }

        // Change a block and redraw the chunks it touches.
        public void Set(int x, int y, int z, byte id)
        {
            if (!InBounds(x, y, z)) return;
            data[Idx(x, y, z)] = id;
            var done = new HashSet<int>();
            for (int dz = -1; dz <= 1; dz++)
                for (int dx = -1; dx <= 1; dx++)
                {
                    int nx = x + dx, nz = z + dz;
                    if (nx < 0 || nz < 0 || nx >= SX || nz >= SZ) continue;
                    int ci = (nz / Chunk) * (SX / Chunk) + nx / Chunk;
                    if (done.Add(ci)) BuildChunk(ci);
                }
        }

        // The height you stand at on column (x, z).
        public int Ground(int x, int z)
        {
            for (int y = SY - 1; y > 0; y--) if (Solid(x, y - 1, z) && !Solid(x, y, z)) return y;
            return Sea;
        }

        // --- Making the island ---

        public void Generate(uint seed)
        {
            System.Array.Clear(data, 0, data.Length);
            var rng = new Rng(seed);
            int s = (int)seed;
            float cx = (SX - 1) / 2f;
            float cz = (SZ - 1) / 2f;
            for (int z = 0; z < SZ; z++)
            {
                for (int x = 0; x < SX; x++)
                {
                    float nx = (x - cx) / (SX / 2f);
                    float nz = (z - cz) / (SZ / 2f);
                    float d = Mathf.Sqrt(nx * nx + nz * nz);
                    d += (Noise.Fbm2(x * 0.07f, z * 0.07f, s + 11, 3) - 0.5f) * 0.35f;
                    float island = 1 - Noise.Smoothstep(0.55f, 0.92f, d);
                    float hills = Noise.Fbm2(x * 0.05f, z * 0.05f, s, 4);
                    float peak = Mathf.Pow(Mathf.Max(0, hills - 0.45f) / 0.55f, 1.6f) * 10;
                    int h = Mathf.FloorToInt(Sea - 3 + island * (4.5f + hills * 4 + peak));
                    h = Mathf.Clamp(h, 2, SY - 10);
                    heights[z * SX + x] = h;
                    bool beach = h <= Sea + 1;
                    bool rocky = Noise.Fbm2(x * 0.09f, z * 0.09f, s + 5, 2) > 0.63f && h > Sea + 4;
                    bool gravel = h <= Sea && Noise.Fbm2(x * 0.15f, z * 0.15f, s + 9, 2) > 0.58f;
                    for (int y = 0; y < h; y++)
                    {
                        byte id = Blocks.Stone;
                        if (y == 0) id = Blocks.Bedrock;
                        else if (y == h - 1) id = gravel ? Blocks.Gravel : beach ? Blocks.Sand : rocky ? Blocks.Stone : Blocks.Grass;
                        else if (y >= h - 4) id = beach ? Blocks.Sand : rocky ? Blocks.Stone : Blocks.Dirt;
                        data[Idx(x, y, z)] = id;
                    }
                }
            }
            // Trees, not too near the middle, where you start.
            var trees = new List<Vector2Int>();
            for (int i = 0; i < 200 && trees.Count < 17; i++)
            {
                int x = 3 + (int)(rng.Next() * (SX - 6));
                int z = 3 + (int)(rng.Next() * (SZ - 6));
                if (Mathf.Sqrt((x - cx) * (x - cx) + (z - cz) * (z - cz)) < 6) continue;
                int h = heights[z * SX + x];
                if (Get(x, h - 1, z) != Blocks.Grass || Get(x, h, z) != Blocks.Air) continue;
                bool close = false;
                foreach (var t in trees) if (Mathf.Abs(t.x - x) < 4 && Mathf.Abs(t.y - z) < 4) close = true;
                if (close) continue;
                Tree(x, h, z, rng);
                trees.Add(new Vector2Int(x, z));
            }
            // Broken old walls to hide behind.
            int ruins = 0;
            for (int i = 0; i < 120 && ruins < 5; i++)
            {
                int x = 4 + (int)(rng.Next() * (SX - 8));
                int z = 4 + (int)(rng.Next() * (SZ - 8));
                float dist = Mathf.Sqrt((x - cx) * (x - cx) + (z - cz) * (z - cz));
                if (dist < 7 || dist > 22 || heights[z * SX + x] <= Sea + 1) continue;
                Ruin(x, z, rng);
                ruins++;
            }
            // Brick pillars as landmarks.
            int pillars = 0;
            for (int i = 0; i < 80 && pillars < 3; i++)
            {
                int x = 4 + (int)(rng.Next() * (SX - 8));
                int z = 4 + (int)(rng.Next() * (SZ - 8));
                float dist = Mathf.Sqrt((x - cx) * (x - cx) + (z - cz) * (z - cz));
                int h = heights[z * SX + x];
                if (dist < 9 || dist > 24 || h <= Sea + 1 || Get(x, h, z) != Blocks.Air) continue;
                int tall = 3 + (int)(rng.Next() * 3);
                for (int k = 0; k < tall; k++) Put(x, h + k, z, k == tall - 1 && rng.Next() < 0.5f ? Blocks.Mossy : Blocks.Brick);
                pillars++;
            }
            for (int ci = 0; ci < filters.Length; ci++) BuildChunk(ci);
        }

        void Leaf(int x, int y, int z)
        {
            if (InBounds(x, y, z) && data[Idx(x, y, z)] == Blocks.Air) data[Idx(x, y, z)] = Blocks.Leaves;
        }

        void Tree(int x, int y0, int z, Rng rng)
        {
            bool pine = rng.Next() < 0.22f;
            if (pine)
            {
                int top = y0 + 5 + (int)(rng.Next() * 3);
                for (int y = y0; y <= top; y++) Put(x, y, z, Blocks.Log);
                int b = y0 + 2;
                for (int y = b; y <= top + 1; y++)
                {
                    float t = (y - b) / (float)(top + 1 - b);
                    int r = Mathf.RoundToInt((1 - t) * 2.6f);
                    if ((top - y) % 2 == 1 && r > 0) r -= 1;
                    for (int dz = -r; dz <= r; dz++)
                        for (int dx = -r; dx <= r; dx++)
                            if (dx * dx + dz * dz <= r * r + 0.6f) Leaf(x + dx, y, z + dz);
                }
                Leaf(x, top + 2, z);
                return;
            }
            // A round oak with a branch or two.
            bool big = rng.Next() < 0.45f;
            int topY = y0 + 3 + (int)(rng.Next() * 2) + (big ? 1 : 0);
            for (int y = y0; y <= topY; y++) Put(x, y, z, Blocks.Log);
            int R = big ? 3 : 2;
            float Rv = big ? 2.2f : 1.8f;
            float cy = topY + (big ? 0 : 0.5f);
            int[,] dirs = { { 1, 0 }, { -1, 0 }, { 0, 1 }, { 0, -1 } };
            for (int n = 0; n < (big ? 2 : 1); n++)
            {
                int k = (int)(rng.Next() * 4);
                int bx = dirs[k, 0], bz = dirs[k, 1];
                int by = topY - 1 - n;
                Put(x + bx, by, z + bz, Blocks.Log);
                if (big) Put(x + bx * 2, by + 1, z + bz * 2, Blocks.Log);
            }
            for (int y = Mathf.FloorToInt(cy - Rv); y <= Mathf.CeilToInt(cy + Rv); y++)
                for (int dz = -R; dz <= R; dz++)
                    for (int dx = -R; dx <= R; dx++)
                    {
                        float q = (dx * dx + dz * dz) / ((R + 0.5f) * (R + 0.5f)) + ((y - cy) * (y - cy)) / ((Rv + 0.5f) * (Rv + 0.5f));
                        if (q > 1) continue;
                        if (q > 0.62f && rng.Next() < 0.35f) continue;
                        Leaf(x + dx, y, z + dz);
                    }
        }

        byte RuinStone(Rng rng)
        {
            float r = rng.Next();
            return r < 0.35f ? Blocks.Mossy : r < 0.7f ? Blocks.StoneBrick : Blocks.Cobble;
        }

        int GroundAt(int x, int z)
        {
            return heights[Mathf.Clamp(z, 0, SZ - 1) * SX + Mathf.Clamp(x, 0, SX - 1)];
        }

        static bool Ok(int x, int z)
        {
            return x >= 1 && z >= 1 && x < SX - 1 && z < SZ - 1;
        }

        void Column(int x, int z, int tall, int b, Rng rng)
        {
            if (!Ok(x, z)) return;
            for (int k = 0; k < tall; k++) Put(x, b + k, z, RuinStone(rng));
        }

        void Ruin(int x, int z, Rng rng)
        {
            float kind = rng.Next();
            if (kind < 0.5f)
            {
                // A broken wall with a window.
                int len = 5 + (int)(rng.Next() * 4);
                bool alongX = rng.Next() < 0.5f;
                int tall = 3 + (rng.Next() < 0.4f ? 1 : 0);
                int win = 1 + (int)(rng.Next() * (len - 3));
                for (int i = 0; i < len; i++)
                {
                    int wx = x + (alongX ? i : 0);
                    int wz = z + (alongX ? 0 : i);
                    int h = Mathf.Max(1, tall - (i == 0 || i == len - 1 ? 1 : 0) - (rng.Next() < 0.3f ? 1 : 0));
                    Column(wx, wz, h, GroundAt(wx, wz), rng);
                    if (Ok(wx, wz) && (i == win || i == win + 1) && h >= 3) Put(wx, GroundAt(wx, wz) + 1, wz, Blocks.Air);
                }
            }
            else
            {
                // An arch: two pillars and the stone across the top.
                bool alongX = rng.Next() < 0.5f;
                int ex = x + (alongX ? 4 : 0);
                int ez = z + (alongX ? 0 : 4);
                int b = Mathf.Min(GroundAt(x, z), GroundAt(ex, ez));
                bool broken = rng.Next() < 0.4f;
                Column(x, z, 5, b, rng);
                Column(ex, ez, broken ? 2 : 5, b, rng);
                for (int i = 1; i <= 3; i++)
                {
                    if (broken && i > 1) break;
                    int wx = x + (alongX ? i : 0);
                    int wz = z + (alongX ? 0 : i);
                    if (Ok(wx, wz)) Put(wx, b + 4, wz, RuinStone(rng));
                }
            }
        }

        // --- Drawing ---

        // Each face: its normal and two directions across it (v is "up" on
        // the sides, so the grass strip sits at the top).
        static readonly Vector3Int[] N = { new Vector3Int(1, 0, 0), new Vector3Int(-1, 0, 0), new Vector3Int(0, 0, 1), new Vector3Int(0, 0, -1), new Vector3Int(0, 1, 0), new Vector3Int(0, -1, 0) };
        static readonly Vector3Int[] U = { new Vector3Int(0, 0, -1), new Vector3Int(0, 0, 1), new Vector3Int(1, 0, 0), new Vector3Int(-1, 0, 0), new Vector3Int(1, 0, 0), new Vector3Int(1, 0, 0) };
        static readonly Vector3Int[] V = { new Vector3Int(0, 1, 0), new Vector3Int(0, 1, 0), new Vector3Int(0, 1, 0), new Vector3Int(0, 1, 0), new Vector3Int(0, 0, 1), new Vector3Int(0, 0, -1) };
        // How bright each face is (sunlight from above), like the web version.
        static readonly float[] Light = { 0.82f, 0.82f, 0.7f, 0.7f, 1f, 0.55f };
        static readonly float[] Ao = { 0.5f, 0.66f, 0.83f, 1f };
        static bool[] flip;

        // Unity draws triangles whose corners go clockwise as seen from the
        // front: work out which way round each face's corners need to go.
        static void WorkOutWinding()
        {
            flip = new bool[6];
            for (int f = 0; f < 6; f++)
            {
                Vector3 p0 = -(Vector3)U[f] - (Vector3)V[f];
                Vector3 p1 = (Vector3)U[f] - (Vector3)V[f];
                Vector3 p2 = (Vector3)U[f] + (Vector3)V[f];
                flip[f] = Vector3.Dot(Vector3.Cross(p1 - p0, p2 - p0), (Vector3)N[f]) < 0;
            }
        }

        readonly List<Vector3> verts = new List<Vector3>();
        readonly List<Vector2> uvs = new List<Vector2>();
        readonly List<Color32> cols = new List<Color32>();
        readonly List<int> tris = new List<int>();

        void BuildChunk(int ci)
        {
            if (flip == null) WorkOutWinding();
            int ncx = SX / Chunk;
            int x0 = (ci % ncx) * Chunk;
            int z0 = (ci / ncx) * Chunk;
            verts.Clear();
            uvs.Clear();
            cols.Clear();
            tris.Clear();
            for (int y = 0; y < SY; y++)
                for (int z = z0; z < z0 + Chunk; z++)
                    for (int x = x0; x < x0 + Chunk; x++)
                    {
                        byte id = data[Idx(x, y, z)];
                        if (id == Blocks.Air) continue;
                        for (int f = 0; f < 6; f++)
                        {
                            Vector3Int n = N[f];
                            int nx = x + n.x, ny = y + n.y, nz = z + n.z;
                            if (Solid(nx, ny, nz)) continue;
                            Vector4 r = Atlas.Rect(Blocks.Tile(id, f == 4 ? 0 : f == 5 ? 2 : 1));
                            Vector3 c = new Vector3(x + 0.5f, y + 0.5f, z + 0.5f) + (Vector3)n * 0.5f;
                            int b = verts.Count;
                            int[] ao = new int[4];
                            for (int k = 0; k < 4; k++)
                            {
                                int su = (k == 1 || k == 2) ? 1 : -1;
                                int sv = (k >= 2) ? 1 : -1;
                                Vector3Int du = U[f] * su;
                                Vector3Int dv = V[f] * sv;
                                bool s1 = Solid(nx + du.x, ny + du.y, nz + du.z);
                                bool s2 = Solid(nx + dv.x, ny + dv.y, nz + dv.z);
                                bool s3 = Solid(nx + du.x + dv.x, ny + du.y + dv.y, nz + du.z + dv.z);
                                ao[k] = (s1 && s2) ? 0 : 3 - ((s1 ? 1 : 0) + (s2 ? 1 : 0) + (s3 ? 1 : 0));
                                verts.Add(c + (Vector3)du * 0.5f + (Vector3)dv * 0.5f);
                                uvs.Add(new Vector2(su < 0 ? r.x : r.z, sv < 0 ? r.y : r.w));
                                byte l = (byte)(255 * Light[f] * Ao[ao[k]]);
                                cols.Add(new Color32(l, l, l, 255));
                            }
                            // Split the square along the diagonal that keeps the shading smooth.
                            bool alt = ao[0] + ao[2] < ao[1] + ao[3];
                            int a0 = alt ? 1 : 0;
                            int q0 = b + a0, q1 = b + (a0 + 1) % 4, q2 = b + (a0 + 2) % 4, q3 = b + (a0 + 3) % 4;
                            if (!flip[f])
                            {
                                tris.Add(q0); tris.Add(q1); tris.Add(q2);
                                tris.Add(q0); tris.Add(q2); tris.Add(q3);
                            }
                            else
                            {
                                tris.Add(q0); tris.Add(q2); tris.Add(q1);
                                tris.Add(q0); tris.Add(q3); tris.Add(q2);
                            }
                        }
                    }
            var mesh = filters[ci].sharedMesh;
            mesh.Clear();
            mesh.SetVertices(verts);
            mesh.SetUVs(0, uvs);
            mesh.SetColors(cols);
            mesh.SetTriangles(tris, 0);
            mesh.RecalculateBounds();
            var mc = colliders[ci];
            mc.sharedMesh = null;
            if (verts.Count > 0) mc.sharedMesh = mesh;
        }

        // --- Finding blocks ---

        // The first solid block along a ray (for building). Returns false if
        // there's nothing within maxDist.
        public bool Raycast(Vector3 o, Vector3 d, float maxDist, out Vector3Int hit, out Vector3Int normal)
        {
            hit = Vector3Int.zero;
            normal = Vector3Int.zero;
            int x = Mathf.FloorToInt(o.x), y = Mathf.FloorToInt(o.y), z = Mathf.FloorToInt(o.z);
            int sx = d.x > 0 ? 1 : -1, sy = d.y > 0 ? 1 : -1, sz = d.z > 0 ? 1 : -1;
            float tdx = d.x != 0 ? Mathf.Abs(1 / d.x) : float.PositiveInfinity;
            float tdy = d.y != 0 ? Mathf.Abs(1 / d.y) : float.PositiveInfinity;
            float tdz = d.z != 0 ? Mathf.Abs(1 / d.z) : float.PositiveInfinity;
            float tmx = d.x != 0 ? ((sx > 0 ? x + 1 - o.x : o.x - x) * tdx) : float.PositiveInfinity;
            float tmy = d.y != 0 ? ((sy > 0 ? y + 1 - o.y : o.y - y) * tdy) : float.PositiveInfinity;
            float tmz = d.z != 0 ? ((sz > 0 ? z + 1 - o.z : o.z - z) * tdz) : float.PositiveInfinity;
            float t = 0;
            Vector3Int n = Vector3Int.zero;
            while (t <= maxDist)
            {
                if (Solid(x, y, z) && y >= 0)
                {
                    hit = new Vector3Int(x, y, z);
                    normal = n;
                    return true;
                }
                if (tmx < tmy && tmx < tmz)
                {
                    x += sx; t = tmx; tmx += tdx; n = new Vector3Int(-sx, 0, 0);
                }
                else if (tmy < tmz)
                {
                    y += sy; t = tmy; tmy += tdy; n = new Vector3Int(0, -sy, 0);
                }
                else
                {
                    z += sz; t = tmz; tmz += tdz; n = new Vector3Int(0, 0, -sz);
                }
            }
            return false;
        }

        // A random dry spot to stand on, between min and max metres from p.
        public bool LandSpot(Vector3 p, float min, float max, Rng rng, out Vector3 spot)
        {
            for (int k = 0; k < 60; k++)
            {
                float a = rng.Next() * Mathf.PI * 2;
                float r = min + rng.Next() * (max - min);
                int x = Mathf.FloorToInt(p.x + Mathf.Cos(a) * r);
                int z = Mathf.FloorToInt(p.z + Mathf.Sin(a) * r);
                if (x < 2 || z < 2 || x >= SX - 2 || z >= SZ - 2) continue;
                int y = Ground(x, z);
                if (y <= Sea) continue;
                spot = new Vector3(x + 0.5f, y, z + 0.5f);
                return true;
            }
            spot = new Vector3(SX / 2f, Ground(SX / 2, SZ / 2), SZ / 2f);
            return false;
        }
    }
}
