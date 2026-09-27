namespace BlockfireVR
{
    // Seeded random numbers and noise, the same maths as the web version
    // (src/rng.js), so a seed makes the same island.
    public class Rng
    {
        uint a;

        public Rng(uint seed)
        {
            a = seed;
        }

        // 0 (inclusive) to 1 (exclusive).
        public float Next()
        {
            unchecked
            {
                a += 0x6d2b79f5;
                uint t = a;
                t = (t ^ (t >> 15)) * (t | 1);
                t ^= t + (t ^ (t >> 7)) * (t | 61);
                return (float)((t ^ (t >> 14)) / 4294967296.0);
            }
        }

        public float Range(float min, float max)
        {
            return min + Next() * (max - min);
        }

        public int Range(int min, int maxExclusive)
        {
            return min + (int)(Next() * (maxExclusive - min));
        }
    }

    public static class Noise
    {
        public static float Hash2(int x, int y, int seed)
        {
            unchecked
            {
                uint h = ((uint)x * 374761393u) ^ ((uint)y * 668265263u) ^ ((uint)seed * 1442695041u);
                h = (h ^ (h >> 13)) * 1274126177u;
                h ^= h >> 16;
                return (float)(h / 4294967296.0);
            }
        }

        static float Fade(float t)
        {
            return t * t * (3 - 2 * t);
        }

        public static float Value2(float x, float y, int seed)
        {
            int xi = (int)System.Math.Floor(x);
            int yi = (int)System.Math.Floor(y);
            float xf = Fade(x - xi);
            float yf = Fade(y - yi);
            float a = Hash2(xi, yi, seed);
            float b = Hash2(xi + 1, yi, seed);
            float c = Hash2(xi, yi + 1, seed);
            float d = Hash2(xi + 1, yi + 1, seed);
            return a + (b - a) * xf + (c - a) * yf + (a - b - c + d) * xf * yf;
        }

        public static float Fbm2(float x, float y, int seed, int octaves)
        {
            float sum = 0;
            float amp = 1;
            float norm = 0;
            float f = 1;
            for (int i = 0; i < octaves; i++)
            {
                sum += Value2(x * f, y * f, seed + i * 101) * amp;
                norm += amp;
                amp *= 0.5f;
                f *= 2;
            }
            return sum / norm;
        }

        public static float Smoothstep(float a, float b, float x)
        {
            float t = (x - a) / (b - a);
            if (t < 0) t = 0;
            if (t > 1) t = 1;
            return t * t * (3 - 2 * t);
        }
    }
}
