using UnityEngine;

namespace BlockfireVR
{
    public enum MobKind { Mosshead, Mini, Giant, Bone, King }

    // A blocky mob that walks (and jumps) towards you and hits you when it
    // gets close, like the Mossheads in the web version.
    public class Mob : MonoBehaviour
    {
        public MobKind kind;
        public float hp, maxHp;
        public float scale = 1;
        public int dmg = 2;
        public int points = 10;
        public bool dying;
        public float speed = 2.4f;
        public float HeadY
        {
            get { return transform.position.y + 1.35f * scale; }
        }

        CharacterController cc;
        Transform legL, legR, armL, armR, headT, body;
        Renderer[] renderers;
        MaterialPropertyBlock mpb;
        float vy, attackT, flashT, walk, stuckT, sidestepT, deathT;
        Vector3 lastPos, sidestep;
        Game game;
        static readonly int FlashId = Shader.PropertyToID("_Flash");

        public void Init(Game g, MobKind k, float waveMul)
        {
            game = g;
            kind = k;
            Color32 skin, dark, top, eye;
            switch (k)
            {
                case MobKind.Mini:
                    scale = 0.6f; maxHp = 8; speed = 3.6f; dmg = 1; points = 8;
                    skin = Boxes.Hex("#7fbf52"); dark = Boxes.Hex("#4f7d34"); top = Boxes.Hex("#a6d96a"); eye = Boxes.Hex("#ffe14a");
                    break;
                case MobKind.Giant:
                    scale = 1.7f; maxHp = 70; speed = 1.6f; dmg = 4; points = 30;
                    skin = Boxes.Hex("#4c7a33"); dark = Boxes.Hex("#2f5220"); top = Boxes.Hex("#6fa04a"); eye = Boxes.Hex("#ff7a2f");
                    break;
                case MobKind.Bone:
                    scale = 1; maxHp = 18; speed = 2.9f; dmg = 2; points = 15;
                    skin = Boxes.Hex("#e8e4d4"); dark = Boxes.Hex("#b8b2a0"); top = Boxes.Hex("#f4f1e4"); eye = Boxes.Hex("#6fd3ff");
                    break;
                case MobKind.King:
                    scale = 3f; maxHp = 400; speed = 1.8f; dmg = 6; points = 250;
                    skin = Boxes.Hex("#3f6a2a"); dark = Boxes.Hex("#264417"); top = Boxes.Hex("#5f9a37"); eye = Boxes.Hex("#ff3a2a");
                    break;
                default:
                    scale = 1; maxHp = 20; speed = 2.4f; dmg = 2; points = 10;
                    skin = Boxes.Hex("#5f9a37"); dark = Boxes.Hex("#3e6a2a"); top = Boxes.Hex("#8cc257"); eye = Boxes.Hex("#ffd23f");
                    break;
            }
            maxHp *= waveMul;
            hp = maxHp;
            Build(skin, dark, top, eye);
            cc = gameObject.AddComponent<CharacterController>();
            cc.radius = 0.38f * scale;
            cc.height = 1.9f * scale;
            cc.center = new Vector3(0, 0.95f * scale + 0.02f, 0);
            cc.stepOffset = Mathf.Min(0.5f * scale, 0.9f);
            cc.skinWidth = 0.03f;
            renderers = GetComponentsInChildren<Renderer>();
            mpb = new MaterialPropertyBlock();
            lastPos = transform.position;
        }

        void Build(Color32 skin, Color32 dark, Color32 top, Color32 eye)
        {
            var mat = game.solidMat;
            float s = scale;
            var black = new Color32(20, 22, 18, 255);
            // Body.
            body = new Boxes().Add(new Vector3(0, 1.05f, 0) * s, new Vector3(0.62f, 0.72f, 0.36f) * s, skin)
                .Add(new Vector3(0, 1.3f, 0.19f) * s, new Vector3(0.4f, 0.2f, 0.04f) * s, dark)
                .Make("Body", transform, mat).transform;
            // Legs and arms swing from the hip and shoulder.
            legL = Limb("Leg L", new Vector3(-0.16f, 0.7f, 0) * s, new Vector3(0.26f, 0.7f, 0.28f) * s, dark, mat);
            legR = Limb("Leg R", new Vector3(0.16f, 0.7f, 0) * s, new Vector3(0.26f, 0.7f, 0.28f) * s, dark, mat);
            armL = Limb("Arm L", new Vector3(-0.44f, 1.38f, 0) * s, new Vector3(0.22f, 0.7f, 0.24f) * s, skin, mat);
            armR = Limb("Arm R", new Vector3(0.44f, 1.38f, 0) * s, new Vector3(0.22f, 0.7f, 0.24f) * s, skin, mat);
            // Head: mossy on top, dark eyes with glowing middles.
            var h = new Boxes()
                .Add(new Vector3(0, 0.3f, 0) * s, new Vector3(0.6f, 0.6f, 0.6f) * s, skin)
                .Add(new Vector3(0, 0.63f, 0) * s, new Vector3(0.64f, 0.08f, 0.64f) * s, top)
                .Add(new Vector3(-0.15f, 0.34f, 0.305f) * s, new Vector3(0.16f, 0.12f, 0.02f) * s, black)
                .Add(new Vector3(0.15f, 0.34f, 0.305f) * s, new Vector3(0.16f, 0.12f, 0.02f) * s, black)
                .Add(new Vector3(-0.15f, 0.34f, 0.315f) * s, new Vector3(0.07f, 0.07f, 0.02f) * s, eye)
                .Add(new Vector3(0.15f, 0.34f, 0.315f) * s, new Vector3(0.07f, 0.07f, 0.02f) * s, eye)
                .Add(new Vector3(0, 0.14f, 0.305f) * s, new Vector3(0.3f, 0.06f, 0.02f) * s, black);
            if (kind == MobKind.King)
            {
                // A gold crown.
                var gold = Boxes.Hex("#f2c230");
                h.Add(new Vector3(0, 0.72f, 0) * s, new Vector3(0.5f, 0.1f, 0.5f) * s, gold);
                for (int i = 0; i < 4; i++)
                {
                    float a = i * Mathf.PI / 2 + Mathf.PI / 4;
                    h.Add(new Vector3(Mathf.Cos(a) * 0.2f, 0.82f, Mathf.Sin(a) * 0.2f) * s, new Vector3(0.1f, 0.14f, 0.1f) * s, gold);
                }
                h.Add(new Vector3(0, 0.8f, 0.24f) * s, new Vector3(0.08f, 0.08f, 0.04f) * s, Boxes.Hex("#d8392b"));
            }
            if (kind == MobKind.Bone)
            {
                // A skeleton: a thinner body with ribs.
                var ribs = new Boxes().Add(new Vector3(0, 1.05f, 0) * s, new Vector3(0.5f, 0.72f, 0.3f) * s, skin);
                for (int i = 0; i < 3; i++) ribs.Add(new Vector3(0, 1.2f - i * 0.15f, 0.16f) * s, new Vector3(0.56f, 0.06f, 0.04f) * s, dark);
                body.GetComponent<MeshFilter>().sharedMesh = ribs.ToMesh("Ribs");
            }
            headT = h.Make("Head", transform, mat).transform;
            headT.localPosition = new Vector3(0, 1.41f, 0) * s;
        }

        Transform Limb(string name, Vector3 pivot, Vector3 size, Color32 c, Material mat)
        {
            var pivotT = new GameObject(name).transform;
            pivotT.SetParent(transform, false);
            pivotT.localPosition = pivot;
            new Boxes().Add(new Vector3(0, -size.y / 2, 0), size, c).Make(name + " part", pivotT, mat);
            return pivotT;
        }

        public void Hit(float amount, Vector3 dir, bool head)
        {
            if (dying) return;
            hp -= amount * (head ? 2 : 1);
            flashT = 0.12f;
            // Knocked back a little (big ones hardly move).
            Vector3 push = dir;
            push.y = 0;
            if (cc != null && cc.enabled) cc.Move(push.normalized * 0.25f / scale);
            if (hp <= 0) Die();
            else game.sfx.At(game.sfx.mobHurt, transform.position, 0.8f);
        }

        void Die()
        {
            dying = true;
            deathT = 0;
            cc.enabled = false;
            game.OnMobDied(this);
        }

        public void Tick(float dt, Player p)
        {
            if (dying)
            {
                // Tip over and shrink away, then go poof.
                deathT += dt;
                transform.rotation = Quaternion.Euler(Mathf.Min(90, deathT * 360), transform.eulerAngles.y, 0);
                if (deathT > 0.35f)
                {
                    game.fx.Burst(transform.position + Vector3.up * scale, Boxes.Hex("#6fa04a"), 14 + (int)(scale * 6), 3 * scale, 0.14f * scale);
                    Destroy(gameObject);
                }
                return;
            }
            // Flash white when hit.
            flashT -= dt;
            mpb.SetFloat(FlashId, flashT > 0 ? 0.7f : 0);
            foreach (var r in renderers) r.SetPropertyBlock(mpb);

            Vector3 to = p.head.position - transform.position;
            to.y = 0;
            float dist = to.magnitude;
            Vector3 dir = dist > 0.01f ? to / dist : transform.forward;
            // Stuck on something: try going round it for a moment.
            if (sidestepT > 0)
            {
                sidestepT -= dt;
                dir = (dir + sidestep).normalized;
            }
            float reach = 0.9f + cc.radius;
            bool close = dist < reach && Mathf.Abs(p.Feet.y - transform.position.y) < 2.2f * scale;
            Vector3 v = close ? Vector3.zero : dir * speed;
            if (cc.isGrounded)
            {
                vy = -1;
                // Hop up blocks in the way.
                if (!close && (lastFlags & CollisionFlags.Sides) != 0) vy = 6.5f + scale;
            }
            else vy -= 22 * dt;
            v.y = vy;
            lastFlags = cc.Move(v * dt);
            if (dist > 0.01f) transform.rotation = Quaternion.Slerp(transform.rotation, Quaternion.LookRotation(dir), dt * 8);

            // Hardly moving while trying to: go round.
            float moved = (transform.position - lastPos).magnitude;
            lastPos = transform.position;
            if (!close && moved < speed * dt * 0.2f) stuckT += dt;
            else stuckT = Mathf.Max(0, stuckT - dt);
            if (stuckT > 1.2f)
            {
                stuckT = 0;
                sidestepT = 1.2f;
                sidestep = Vector3.Cross(Vector3.up, dir) * (Random.value < 0.5f ? 1.5f : -1.5f);
            }

            // Walking: swing the arms and legs.
            walk += dt * (close ? 2 : speed * 3.2f / scale);
            float sw = Mathf.Sin(walk) * (close ? 0.2f : 0.6f);
            legL.localRotation = Quaternion.Euler(sw * 45, 0, 0);
            legR.localRotation = Quaternion.Euler(-sw * 45, 0, 0);
            armL.localRotation = Quaternion.Euler(-sw * 40 - (close ? 70 : 0), 0, 0);
            armR.localRotation = Quaternion.Euler(sw * 40 - (close ? 70 : 0), 0, 0);
            headT.localRotation = Quaternion.Euler(0, Mathf.Sin(walk * 0.5f) * 8, 0);

            // Hit you.
            attackT -= dt;
            if (close && attackT <= 0)
            {
                attackT = kind == MobKind.King ? 1.6f : 1.0f;
                armL.localRotation = Quaternion.Euler(-120, 0, 0);
                armR.localRotation = Quaternion.Euler(-120, 0, 0);
                game.HurtPlayer(dmg, transform.position);
            }

            // Fell in the sea or off the world: gone.
            if (transform.position.y < -4) Die();
        }

        CollisionFlags lastFlags;
    }
}
