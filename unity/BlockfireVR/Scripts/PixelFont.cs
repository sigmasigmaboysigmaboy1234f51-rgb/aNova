using System.Collections.Generic;
using UnityEngine;

namespace BlockfireVR
{
    // A tiny 5 x 7 pixel font, drawn straight into textures, so text looks
    // blocky like the rest of the game (and needs no font files).
    public static class PixelFont
    {
        // Each letter: 7 rows of 5 pixels, top to bottom ('#' is ink).
        static readonly Dictionary<char, string[]> Glyphs = new Dictionary<char, string[]>
        {
            { 'A', new[] { ".###.", "#...#", "#...#", "#####", "#...#", "#...#", "#...#" } },
            { 'B', new[] { "####.", "#...#", "#...#", "####.", "#...#", "#...#", "####." } },
            { 'C', new[] { ".###.", "#...#", "#....", "#....", "#....", "#...#", ".###." } },
            { 'D', new[] { "####.", "#...#", "#...#", "#...#", "#...#", "#...#", "####." } },
            { 'E', new[] { "#####", "#....", "#....", "####.", "#....", "#....", "#####" } },
            { 'F', new[] { "#####", "#....", "#....", "####.", "#....", "#....", "#...." } },
            { 'G', new[] { ".###.", "#...#", "#....", "#.###", "#...#", "#...#", ".####" } },
            { 'H', new[] { "#...#", "#...#", "#...#", "#####", "#...#", "#...#", "#...#" } },
            { 'I', new[] { "#####", "..#..", "..#..", "..#..", "..#..", "..#..", "#####" } },
            { 'J', new[] { "..###", "...#.", "...#.", "...#.", "#..#.", "#..#.", ".##.." } },
            { 'K', new[] { "#...#", "#..#.", "#.#..", "##...", "#.#..", "#..#.", "#...#" } },
            { 'L', new[] { "#....", "#....", "#....", "#....", "#....", "#....", "#####" } },
            { 'M', new[] { "#...#", "##.##", "#.#.#", "#.#.#", "#...#", "#...#", "#...#" } },
            { 'N', new[] { "#...#", "##..#", "#.#.#", "#..##", "#...#", "#...#", "#...#" } },
            { 'O', new[] { ".###.", "#...#", "#...#", "#...#", "#...#", "#...#", ".###." } },
            { 'P', new[] { "####.", "#...#", "#...#", "####.", "#....", "#....", "#...." } },
            { 'Q', new[] { ".###.", "#...#", "#...#", "#...#", "#.#.#", "#..#.", ".##.#" } },
            { 'R', new[] { "####.", "#...#", "#...#", "####.", "#.#..", "#..#.", "#...#" } },
            { 'S', new[] { ".####", "#....", "#....", ".###.", "....#", "....#", "####." } },
            { 'T', new[] { "#####", "..#..", "..#..", "..#..", "..#..", "..#..", "..#.." } },
            { 'U', new[] { "#...#", "#...#", "#...#", "#...#", "#...#", "#...#", ".###." } },
            { 'V', new[] { "#...#", "#...#", "#...#", "#...#", "#...#", ".#.#.", "..#.." } },
            { 'W', new[] { "#...#", "#...#", "#...#", "#.#.#", "#.#.#", "##.##", "#...#" } },
            { 'X', new[] { "#...#", "#...#", ".#.#.", "..#..", ".#.#.", "#...#", "#...#" } },
            { 'Y', new[] { "#...#", "#...#", ".#.#.", "..#..", "..#..", "..#..", "..#.." } },
            { 'Z', new[] { "#####", "....#", "...#.", "..#..", ".#...", "#....", "#####" } },
            { '0', new[] { ".###.", "#...#", "#..##", "#.#.#", "##..#", "#...#", ".###." } },
            { '1', new[] { "..#..", ".##..", "..#..", "..#..", "..#..", "..#..", ".###." } },
            { '2', new[] { ".###.", "#...#", "....#", "...#.", "..#..", ".#...", "#####" } },
            { '3', new[] { "####.", "....#", "....#", ".###.", "....#", "....#", "####." } },
            { '4', new[] { "...#.", "..##.", ".#.#.", "#..#.", "#####", "...#.", "...#." } },
            { '5', new[] { "#####", "#....", "####.", "....#", "....#", "#...#", ".###." } },
            { '6', new[] { "..##.", ".#...", "#....", "####.", "#...#", "#...#", ".###." } },
            { '7', new[] { "#####", "....#", "...#.", "..#..", ".#...", ".#...", ".#..." } },
            { '8', new[] { ".###.", "#...#", "#...#", ".###.", "#...#", "#...#", ".###." } },
            { '9', new[] { ".###.", "#...#", "#...#", ".####", "....#", "...#.", ".##.." } },
            { ' ', new[] { ".....", ".....", ".....", ".....", ".....", ".....", "....." } },
            { '.', new[] { ".....", ".....", ".....", ".....", ".....", ".##..", ".##.." } },
            { ',', new[] { ".....", ".....", ".....", ".....", ".##..", "..#..", ".#..." } },
            { '!', new[] { "..#..", "..#..", "..#..", "..#..", "..#..", ".....", "..#.." } },
            { '?', new[] { ".###.", "#...#", "....#", "...#.", "..#..", ".....", "..#.." } },
            { ':', new[] { ".....", ".##..", ".##..", ".....", ".##..", ".##..", "....." } },
            { '/', new[] { "....#", "....#", "...#.", "..#..", ".#...", "#....", "#...." } },
            { '-', new[] { ".....", ".....", ".....", ".###.", ".....", ".....", "....." } },
            { '+', new[] { ".....", "..#..", "..#..", "#####", "..#..", "..#..", "....." } },
            { '\'', new[] { "..#..", "..#..", ".#...", ".....", ".....", ".....", "....." } },
            { '(', new[] { "...#.", "..#..", ".#...", ".#...", ".#...", "..#..", "...#." } },
            { ')', new[] { ".#...", "..#..", "...#.", "...#.", "...#.", "..#..", ".#..." } },
            { '%', new[] { "##..#", "##..#", "...#.", "..#..", ".#...", "#..##", "#..##" } },
            { '*', new[] { ".....", "#.#.#", ".###.", "#####", ".###.", "#.#.#", "....." } },
            { '<', new[] { "...#.", "..#..", ".#...", "#....", ".#...", "..#..", "...#." } },
            { '>', new[] { ".#...", "..#..", "...#.", "....#", "...#.", "..#..", ".#..." } },
            { '=', new[] { ".....", ".....", "#####", ".....", "#####", ".....", "....." } },
        };

        // A heart for the health bar: 0 empty, 1 half, 2 full.
        static readonly string[] Heart = { ".##.##.", "#######", "#######", "#######", ".#####.", "..###..", "...#..." };

        public const int GlyphW = 6;
        public const int GlyphH = 8;

        public static int Width(string text, int scale)
        {
            return text.Length * GlyphW * scale;
        }

        // Writes text with its top-left at (x, y) (y counts down from the
        // top), with a dark outline so it reads on anything.
        public static void Draw(Color32[] px, int w, int h, string text, int x, int y, int scale, Color32 color)
        {
            var shadow = new Color32(0, 0, 0, 230);
            for (int pass = 0; pass < 2; pass++)
            {
                int cx = x;
                foreach (char ch0 in text)
                {
                    char ch = char.ToUpperInvariant(ch0);
                    string[] g;
                    if (!Glyphs.TryGetValue(ch, out g)) g = Glyphs['?'];
                    for (int r = 0; r < 7; r++)
                        for (int c = 0; c < 5; c++)
                        {
                            if (g[r][c] != '#') continue;
                            if (pass == 0)
                            {
                                // The outline: one pixel all round.
                                for (int oy = -1; oy <= scale; oy++)
                                    for (int ox = -1; ox <= scale; ox++)
                                        Plot(px, w, h, cx + c * scale + ox, y + r * scale + oy, shadow);
                            }
                            else
                            {
                                for (int oy = 0; oy < scale; oy++)
                                    for (int ox = 0; ox < scale; ox++)
                                        Plot(px, w, h, cx + c * scale + ox, y + r * scale + oy, color);
                            }
                        }
                    cx += GlyphW * scale;
                }
            }
        }

        public static void DrawHeart(Color32[] px, int w, int h, int x, int y, int scale, int fill)
        {
            var red = new Color32(230, 50, 46, 255);
            var dark = new Color32(60, 20, 20, 255);
            var edge = new Color32(0, 0, 0, 230);
            for (int r = 0; r < 7; r++)
                for (int c = 0; c < 7; c++)
                {
                    if (Heart[r][c] != '#') continue;
                    bool lit = fill == 2 || (fill == 1 && c < 4);
                    for (int oy = -1; oy <= scale; oy++)
                        for (int ox = -1; ox <= scale; ox++)
                            if (oy < 0 || ox < 0 || oy >= scale || ox >= scale) Plot(px, w, h, x + c * scale + ox, y + r * scale + oy, edge, true);
                    for (int oy = 0; oy < scale; oy++)
                        for (int ox = 0; ox < scale; ox++)
                            Plot(px, w, h, x + c * scale + ox, y + r * scale + oy, lit ? red : dark);
                }
        }

        public static void Fill(Color32[] px, int w, int h, int x, int y, int rw, int rh, Color32 color)
        {
            for (int j = 0; j < rh; j++)
                for (int i = 0; i < rw; i++)
                    Plot(px, w, h, x + i, y + j, color);
        }

        // y counts down from the top of the picture.
        static void Plot(Color32[] px, int w, int h, int x, int y, Color32 c, bool under = false)
        {
            if (x < 0 || y < 0 || x >= w || y >= h) return;
            int k = (h - 1 - y) * w + x;
            if (under && px[k].a > 240) return;
            px[k] = c;
        }
    }

    // A floating picture with text on it (the HUD, banners, menus).
    public class TextPanel
    {
        public readonly GameObject go;
        public readonly Transform t;
        readonly Texture2D tex;
        readonly Color32[] px;
        readonly int w, h;
        readonly Color32 back;
        string last;

        // size: metres across. pw x ph: pixels. back: the background colour
        // (transparent for none).
        public TextPanel(string name, Transform parent, Material transparent, float size, int pw, int ph, Color32 back)
        {
            w = pw;
            h = ph;
            this.back = back;
            tex = new Texture2D(pw, ph, TextureFormat.RGBA32, false);
            tex.filterMode = FilterMode.Point;
            tex.wrapMode = TextureWrapMode.Clamp;
            px = new Color32[pw * ph];
            go = new GameObject(name);
            t = go.transform;
            t.SetParent(parent, false);
            go.AddComponent<MeshFilter>().sharedMesh = Boxes.Quad(size, size * ph / pw);
            var mr = go.AddComponent<MeshRenderer>();
            var mat = new Material(transparent);
            mat.mainTexture = tex;
            mr.sharedMaterial = mat;
            mr.shadowCastingMode = UnityEngine.Rendering.ShadowCastingMode.Off;
        }

        public void Clear()
        {
            for (int i = 0; i < px.Length; i++) px[i] = back;
        }

        public void Text(string text, int y, int scale, Color32 color)
        {
            int x = (w - PixelFont.Width(text, scale)) / 2 + scale / 2;
            PixelFont.Draw(px, w, h, text, x, y, scale, color);
        }

        public void TextAt(string text, int x, int y, int scale, Color32 color)
        {
            PixelFont.Draw(px, w, h, text, x, y, scale, color);
        }

        public void Heart(int x, int y, int scale, int fill)
        {
            PixelFont.DrawHeart(px, w, h, x, y, scale, fill);
        }

        public void Bar(int x, int y, int bw, int bh, float k, Color32 color)
        {
            PixelFont.Fill(px, w, h, x - 1, y - 1, bw + 2, bh + 2, new Color32(0, 0, 0, 220));
            PixelFont.Fill(px, w, h, x, y, bw, bh, new Color32(40, 30, 28, 255));
            PixelFont.Fill(px, w, h, x, y, Mathf.RoundToInt(bw * Mathf.Clamp01(k)), bh, color);
        }

        public void Apply()
        {
            tex.SetPixels32(px);
            tex.Apply(false);
        }

        // Only redraws when the key changes.
        public bool Changed(string key)
        {
            if (key == last) return false;
            last = key;
            return true;
        }

        public bool Visible
        {
            get { return go.activeSelf; }
            set { if (go.activeSelf != value) go.SetActive(value); }
        }
    }
}
