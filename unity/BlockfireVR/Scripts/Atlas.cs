using UnityEngine;

namespace BlockfireVR
{
    // All the block textures in one picture, painted pixel by pixel in code
    // (like src/textures.js). Each 16 x 16 tile sits in a 32 x 32 cell with its
    // own pixels wrapped round it, so the far-away (smaller) versions of the
    // texture don't bleed into the next tile.
    public static class Atlas
    {
        public const int GrassTop = 0, GrassSide = 1, Dirt = 2, Stone = 3, Sand = 4, LogSide = 5, LogTop = 6, Leaves = 7;
        public const int Planks = 8, Cobble = 9, Bedrock = 10, Brick = 11, Gold = 12, Mossy = 13, StoneBrick = 14, Gravel = 15;

        const int Tile = 16;
        const int Cell = 32;
        const int Pad = 8;
        const int Cols = 4;
        const int Size = Cell * Cols;

        static Texture2D tex;

        public static Texture2D Texture
        {
            get
            {
                if (tex == null) tex = Build();
                return tex;
            }
        }

        // The UV rectangle of a tile: (xMin, yMin, xMax, yMax).
        public static Vector4 Rect(int tile)
        {
            int col = tile % Cols;
            int row = tile / Cols;
            float x0 = (col * Cell + Pad) / (float)Size;
            float y0 = (row * Cell + Pad) / (float)Size;
            float s = Tile / (float)Size;
            return new Vector4(x0, y0, x0 + s, y0 + s);
        }

        static Color32 C(int r, int g, int b)
        {
            return new Color32((byte)Mathf.Clamp(r, 0, 255), (byte)Mathf.Clamp(g, 0, 255), (byte)Mathf.Clamp(b, 0, 255), 255);
        }

        static Color32 Shade(Color32 c, float k)
        {
            return C((int)(c.r * k), (int)(c.g * k), (int)(c.b * k));
        }

        // A little random number for pixel (i, j) of tile t.
        static float R(int t, int i, int j, int salt = 0)
        {
            return Noise.Hash2(i + t * 31, j + salt * 17, 7 + t);
        }

        static Color32 Pick(int t, int i, int j, params Color32[] cols)
        {
            int k = (int)(R(t, i, j) * cols.Length);
            return cols[Mathf.Min(k, cols.Length - 1)];
        }

        // The colour of pixel (i, j) of tile t, where j = 0 is the top row.
        static Color32 Paint(int t, int i, int j)
        {
            switch (t)
            {
                case GrassTop:
                    return Pick(t, i, j, C(95, 154, 55), C(103, 162, 61), C(111, 171, 68), C(125, 186, 79), C(88, 142, 50));
                case GrassSide:
                {
                    // Dirt with a ragged strip of grass along the top.
                    int lip = 3 + (int)(R(t, i, 0, 3) * 2.2f);
                    if (j < lip) return Pick(t, i, j, C(95, 154, 55), C(103, 162, 61), C(88, 142, 50));
                    return Paint(Dirt, i, j);
                }
                case Dirt:
                    return Pick(t, i, j, C(122, 84, 54), C(109, 74, 47), C(131, 92, 60), C(98, 66, 42), C(140, 100, 66));
                case Stone:
                {
                    float n = Noise.Value2(i * 0.45f, j * 0.45f, 3);
                    Color32 b = Pick(t, i, j, C(128, 128, 128), C(120, 120, 120), C(136, 136, 136), C(114, 114, 114));
                    return n > 0.68f ? Shade(b, 0.8f) : b;
                }
                case Sand:
                    return Pick(t, i, j, C(219, 202, 146), C(212, 194, 138), C(226, 210, 156), C(204, 186, 130));
                case LogSide:
                {
                    // Bark in up-and-down stripes.
                    Color32 b = (i % 4 == 0) ? C(76, 56, 34) : Pick(t, i, j, C(104, 78, 48), C(96, 72, 44), C(112, 86, 54));
                    return R(t, i, j, 5) < 0.08f ? Shade(b, 0.75f) : b;
                }
                case LogTop:
                {
                    float d = Mathf.Sqrt((i - 7.5f) * (i - 7.5f) + (j - 7.5f) * (j - 7.5f));
                    if (d > 6.8f) return C(96, 72, 44);
                    return ((int)d % 2 == 0) ? C(176, 142, 92) : C(154, 120, 76);
                }
                case Leaves:
                {
                    // Gaps you can see through.
                    if (R(t, i, j, 9) < 0.14f) return new Color32(0, 0, 0, 0);
                    return Pick(t, i, j, C(62, 118, 44), C(72, 132, 50), C(54, 104, 38), C(84, 146, 58));
                }
                case Planks:
                {
                    // Boards four pixels high, with the joins staggered.
                    int board = j / 4;
                    int seam = (board % 2 == 0) ? 5 : 11;
                    if (j % 4 == 3 || i == seam) return C(122, 90, 52);
                    Color32 b = Pick(t, i, j, C(176, 136, 84), C(168, 128, 78), C(184, 144, 90));
                    return Shade(b, 1 - board * 0.02f);
                }
                case Cobble:
                {
                    // Round-ish stones with dark cracks between.
                    float n = Noise.Value2(i * 0.55f, j * 0.55f, 11);
                    if (n > 0.47f && n < 0.53f) return C(70, 70, 70);
                    return Pick(t, i, j, C(118, 118, 118), C(104, 104, 104), C(132, 132, 132), C(96, 96, 96));
                }
                case Bedrock:
                    return Pick(t, i, j, C(40, 40, 42), C(58, 58, 60), C(30, 30, 32), C(72, 72, 74));
                case Brick:
                {
                    int row = j / 4;
                    int off = (row % 2 == 0) ? 0 : 4;
                    if (j % 4 == 3 || (i + off) % 8 == 7) return C(190, 182, 170);
                    return Pick(t, i, j, C(160, 76, 60), C(148, 68, 54), C(170, 84, 66));
                }
                case Gold:
                {
                    Color32 b = Pick(t, i, j, C(242, 194, 48), C(250, 210, 70), C(230, 178, 36));
                    return (i == 0 || j == 0) ? C(255, 236, 140) : (i == 15 || j == 15) ? C(190, 140, 20) : b;
                }
                case Mossy:
                {
                    Color32 s = Paint(Cobble, i, j);
                    float n = Noise.Value2(i * 0.3f, j * 0.3f, 21);
                    return n > 0.55f ? Pick(t, i, j, C(86, 128, 60), C(96, 140, 66)) : s;
                }
                case StoneBrick:
                {
                    int row = j / 8;
                    int off = (row % 2 == 0) ? 0 : 8;
                    if (j % 8 == 7 || (i + off) % 16 == 15) return C(80, 80, 82);
                    return Pick(t, i, j, C(126, 126, 128), C(118, 118, 120), C(134, 134, 136));
                }
                case Gravel:
                    return Pick(t, i, j, C(136, 130, 124), C(112, 106, 100), C(152, 146, 140), C(96, 92, 88), C(124, 116, 108));
            }
            return C(255, 0, 255);
        }

        static Texture2D Build()
        {
            var t = new Texture2D(Size, Size, TextureFormat.RGBA32, true);
            t.name = "Blockfire atlas";
            t.filterMode = FilterMode.Point;
            t.wrapMode = TextureWrapMode.Clamp;
            var px = new Color32[Size * Size];
            for (int tile = 0; tile < Cols * Cols; tile++)
            {
                int cx = (tile % Cols) * Cell;
                int cy = (tile / Cols) * Cell;
                var src = new Color32[Tile * Tile];
                for (int j = 0; j < Tile; j++)
                    for (int i = 0; i < Tile; i++)
                        src[j * Tile + i] = Paint(tile, i, j);
                // The whole cell, wrapping the tile round its edges.
                for (int y = 0; y < Cell; y++)
                {
                    for (int x = 0; x < Cell; x++)
                    {
                        int i = ((x - Pad) % Tile + Tile) % Tile;
                        int j = ((y - Pad) % Tile + Tile) % Tile;
                        // Row 0 of a tile is its top: textures count up from the bottom.
                        px[(cy + y) * Size + cx + x] = src[(Tile - 1 - j) * Tile + i];
                    }
                }
            }
            t.SetPixels32(px);
            t.Apply(true, false);
            return t;
        }

        // A 16 x 16 water texture that repeats.
        public static Texture2D Water()
        {
            var t = new Texture2D(16, 16, TextureFormat.RGBA32, true);
            t.filterMode = FilterMode.Point;
            t.wrapMode = TextureWrapMode.Repeat;
            var px = new Color32[256];
            for (int j = 0; j < 16; j++)
                for (int i = 0; i < 16; i++)
                {
                    float n = Noise.Value2(i * 0.4f, j * 0.25f, 44);
                    byte a = 190;
                    px[j * 16 + i] = n > 0.62f ? new Color32(120, 180, 240, a) : n > 0.4f ? new Color32(62, 128, 214, a) : new Color32(50, 110, 196, a);
                }
            t.SetPixels32(px);
            t.Apply(true, false);
            return t;
        }
    }
}
