using UnityEngine;

namespace BlockfireVR
{
    // Every kind of block, and which texture tiles it shows.
    public static class Blocks
    {
        public const byte Air = 0;
        public const byte Grass = 1;
        public const byte Dirt = 2;
        public const byte Stone = 3;
        public const byte Sand = 4;
        public const byte Log = 5;
        public const byte Leaves = 6;
        public const byte Planks = 7;
        public const byte Cobble = 8;
        public const byte Bedrock = 9;
        public const byte Brick = 10;
        public const byte Gold = 11;
        public const byte Mossy = 12;
        public const byte StoneBrick = 13;
        public const byte Gravel = 14;
        public const byte Count = 15;

        // [top, side, bottom] tiles (see Atlas).
        static readonly int[][] Faces =
        {
            new[] { 0, 0, 0 },
            new[] { Atlas.GrassTop, Atlas.GrassSide, Atlas.Dirt },
            new[] { Atlas.Dirt, Atlas.Dirt, Atlas.Dirt },
            new[] { Atlas.Stone, Atlas.Stone, Atlas.Stone },
            new[] { Atlas.Sand, Atlas.Sand, Atlas.Sand },
            new[] { Atlas.LogTop, Atlas.LogSide, Atlas.LogTop },
            new[] { Atlas.Leaves, Atlas.Leaves, Atlas.Leaves },
            new[] { Atlas.Planks, Atlas.Planks, Atlas.Planks },
            new[] { Atlas.Cobble, Atlas.Cobble, Atlas.Cobble },
            new[] { Atlas.Bedrock, Atlas.Bedrock, Atlas.Bedrock },
            new[] { Atlas.Brick, Atlas.Brick, Atlas.Brick },
            new[] { Atlas.Gold, Atlas.Gold, Atlas.Gold },
            new[] { Atlas.Mossy, Atlas.Mossy, Atlas.Mossy },
            new[] { Atlas.StoneBrick, Atlas.StoneBrick, Atlas.StoneBrick },
            new[] { Atlas.Gravel, Atlas.Gravel, Atlas.Gravel },
        };

        public static readonly string[] Names = { "Air", "Grass", "Dirt", "Stone", "Sand", "Log", "Leaves", "Planks", "Cobblestone", "Bedrock", "Bricks", "Gold", "Mossy stone", "Stone bricks", "Gravel" };

        // The blocks you can build with (X changes it).
        public static readonly byte[] Building = { Planks, Cobble, Brick, StoneBrick, Log, Leaves, Stone, Gold, Grass, Sand };

        // A colour for bits that fly off when the block is hit.
        public static readonly Color32[] Chips =
        {
            new Color32(0, 0, 0, 0),
            new Color32(98, 150, 62, 255),
            new Color32(122, 86, 56, 255),
            new Color32(128, 128, 128, 255),
            new Color32(214, 196, 142, 255),
            new Color32(102, 78, 50, 255),
            new Color32(70, 124, 48, 255),
            new Color32(170, 132, 82, 255),
            new Color32(110, 110, 110, 255),
            new Color32(50, 50, 52, 255),
            new Color32(150, 72, 58, 255),
            new Color32(242, 194, 48, 255),
            new Color32(96, 120, 80, 255),
            new Color32(120, 120, 124, 255),
            new Color32(132, 126, 120, 255),
        };

        public static int Tile(byte id, int face)
        {
            return Faces[id][face];
        }

        public static bool Breakable(byte id)
        {
            return id != Air && id != Bedrock;
        }
    }
}
