using UnityEngine;

namespace BlockfireVR
{
    // Your left hand builds: point at a block, pull the trigger to put one
    // next to it, squeeze the grip to break it, X to pick a different block.
    public class Builder
    {
        readonly Game game;
        readonly Transform hand;
        readonly Transform held;
        readonly MeshFilter heldMesh;
        readonly Transform box;
        readonly LineRenderer beam;
        int pick;
        public byte Block
        {
            get { return Blocks.Building[pick]; }
        }

        public Builder(Game g, Transform hand)
        {
            game = g;
            this.hand = hand;
            // The block you're holding, floating just above your hand.
            var go = new GameObject("Held block");
            go.transform.SetParent(hand, false);
            go.transform.localPosition = new Vector3(0, 0.03f, 0.06f);
            go.transform.localRotation = Quaternion.Euler(20, 35, 0);
            heldMesh = go.AddComponent<MeshFilter>();
            go.AddComponent<MeshRenderer>().sharedMaterial = g.worldMat;
            held = go.transform;
            // The outline on the block you're pointing at.
            var b = new Boxes().Add(Vector3.zero, Vector3.one * 1.02f, new Color32(255, 255, 255, 60)).Make("Target", g.transform, g.transparentMat);
            box = b.transform;
            box.gameObject.SetActive(false);
            // A faint beam from your hand.
            var bg = new GameObject("Build beam");
            bg.transform.SetParent(g.transform, false);
            beam = bg.AddComponent<LineRenderer>();
            beam.sharedMaterial = g.glowMat;
            beam.positionCount = 2;
            beam.startWidth = 0.006f;
            beam.endWidth = 0.003f;
            beam.startColor = new Color(1, 1, 1, 0.5f);
            beam.endColor = new Color(1, 1, 1, 0.05f);
            beam.shadowCastingMode = UnityEngine.Rendering.ShadowCastingMode.Off;
            SetBlock(0);
        }

        void SetBlock(int i)
        {
            pick = (i + Blocks.Building.Length) % Blocks.Building.Length;
            heldMesh.sharedMesh = Blocks.Building[pick] == Blocks.Air ? null : Boxes.Block(Blocks.Building[pick], 0.07f);
        }

        public void Tick(Controls c, float dt, bool active)
        {
            held.gameObject.SetActive(active);
            if (!active)
            {
                box.gameObject.SetActive(false);
                beam.enabled = false;
                return;
            }
            held.localRotation *= Quaternion.Euler(0, dt * 40, 0);
            if (c.nextBlock)
            {
                SetBlock(pick + 1);
                game.sfx.Play(game.sfx.click);
            }
            Vector3 o = hand.position;
            Vector3 d = hand.forward;
            Vector3Int hit, n;
            bool found = game.world.Raycast(o, d, 5.5f, out hit, out n);
            box.gameObject.SetActive(found);
            beam.enabled = true;
            beam.SetPosition(0, o);
            beam.SetPosition(1, found ? (Vector3)hit + Vector3.one * 0.5f : o + d * 5.5f);
            if (!found) return;
            box.position = (Vector3)hit + Vector3.one * 0.5f;

            if (c.dig)
            {
                byte id = game.world.Get(hit.x, hit.y, hit.z);
                if (Blocks.Breakable(id))
                {
                    game.world.Set(hit.x, hit.y, hit.z, Blocks.Air);
                    game.fx.Burst(box.position, Blocks.Chips[id], 12, 2.2f, 0.09f, 0.6f);
                    game.sfx.At(game.sfx.dig, box.position);
                    game.controls.Buzz(false, 0.5f, 0.06f);
                }
            }
            else if (c.place)
            {
                Vector3Int p = hit + n;
                if (!VoxelWorld.InBounds(p.x, p.y, p.z) || game.world.Solid(p.x, p.y, p.z)) return;
                Vector3 center = (Vector3)p + Vector3.one * 0.5f;
                // Not inside you or a mob.
                if (Physics.CheckBox(center, Vector3.one * 0.46f, Quaternion.identity, ~0, QueryTriggerInteraction.Ignore))
                {
                    game.sfx.Play(game.sfx.empty);
                    return;
                }
                game.world.Set(p.x, p.y, p.z, Block);
                game.sfx.At(game.sfx.place, center);
                game.controls.Buzz(false, 0.35f, 0.04f);
            }
        }
    }
}
