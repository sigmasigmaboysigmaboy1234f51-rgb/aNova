using System.Collections.Generic;
using UnityEngine;

namespace BlockfireVR
{
    // Blockfire VR: the Endless Waves mode of Blockfire, in virtual reality.
    // Put this on an empty object in an empty scene (the Blockfire menu does
    // it for you) and it builds everything else when you press Play.
    public class Game : MonoBehaviour
    {
        enum State { Title, Playing, Dead }

        [Tooltip("0 = a new island every game.")]
        public int seed = 0;

        [Tooltip("The Blockfire/Voxel shader. Filled in for you; it's here so the shader goes into your build.")]
        public Shader shader;

        [HideInInspector] public Material worldMat, solidMat, glowMat, transparentMat, waterMat;
        [HideInInspector] public VoxelWorld world;
        [HideInInspector] public Player player;
        [HideInInspector] public Sfx sfx;
        [HideInInspector] public Fx fx;
        [HideInInspector] public Controls controls = new Controls();

        Gun gun;
        Builder builder;
        State state = State.Title;
        bool paused;
        readonly List<Mob> mobs = new List<Mob>();
        readonly List<MobKind> queue = new List<MobKind>();
        int wave, score, best, kills;
        float restT, spawnT, stateT, bannerT;
        bool resting = true;
        Mob boss;
        readonly Rng rng = new Rng(12345);
        TextPanel wrist, banner, bossBar, menu;
        Transform menuT, hurtQuad;
        Material hurtMat;
        bool wristOn = true;

        static readonly Color Sky = new Color(0.56f, 0.78f, 1f);

        // Called when you add this to an object in the editor.
        void Reset()
        {
            shader = Shader.Find("Blockfire/Voxel");
        }

        void OnValidate()
        {
            if (shader == null) shader = Shader.Find("Blockfire/Voxel");
        }

        // Headsets move a bit between Update and drawing: read the head and
        // hands again right before each frame is drawn so aiming feels exact.
        void OnEnable()
        {
            Application.onBeforeRender += BeforeRender;
        }

        void OnDisable()
        {
            Application.onBeforeRender -= BeforeRender;
        }

        void BeforeRender()
        {
            if (player == null || !controls.xr) return;
            controls.ReadPoses();
            player.ApplyPoses(controls);
            PlaceWrist();
        }

        void Start()
        {
            MakeMaterials();
            Shader.SetGlobalColor("_BfFogColor", Sky);
            Shader.SetGlobalVector("_BfFog", new Vector4(34, 105, 0, 0));
            best = PlayerPrefs.GetInt("bf_vr_best", 0);

            world = new VoxelWorld(transform, worldMat);
            world.Generate(seed != 0 ? (uint)seed : (uint)Random.Range(1, int.MaxValue));
            MakeSea();
            MakeClouds();

            player = new Player(transform, world);
            player.cam.backgroundColor = Sky;
            player.UseFloorLevel();
            PlaceAtStart();
            var ears = player.head.gameObject.AddComponent<AudioSource>();
            ears.spatialBlend = 0;
            sfx = new Sfx(ears);
            fx = new Fx(transform, solidMat, glowMat);
            gun = new Gun(this, player.right);
            builder = new Builder(this, player.left);
            MakeHud();
            ShowTitle();
        }

        // --- Looks ---

        void MakeMaterials()
        {
            // Our own shader (Shaders/BlockfireVoxel.shader) works in both
            // the built-in renderer and URP, and in both eyes.
            var sh = shader != null ? shader : Shader.Find("Blockfire/Voxel");
            if (sh == null)
            {
                Debug.LogError("Blockfire VR: can't find the Blockfire/Voxel shader. Is the whole BlockfireVR folder in Assets?");
                sh = Shader.Find("Unlit/Texture");
            }
            var baseMat = new Material(sh);
            worldMat = new Material(baseMat) { name = "World", mainTexture = Atlas.Texture };
            worldMat.SetFloat("_Cutoff", 0.5f);
            solidMat = new Material(baseMat) { name = "Solid", mainTexture = Texture2D.whiteTexture };
            glowMat = Transparent(baseMat, "Glow", Texture2D.whiteTexture);
            glowMat.SetFloat("_Fog", 0);
            transparentMat = Transparent(baseMat, "Transparent", Texture2D.whiteTexture);
            transparentMat.SetFloat("_Fog", 0);
            transparentMat.renderQueue = 3100;
            waterMat = Transparent(baseMat, "Water", Atlas.Water());
            waterMat.mainTextureScale = new Vector2(300, 300);
        }

        static Material Transparent(Material baseMat, string name, Texture tex)
        {
            var m = new Material(baseMat) { name = name, mainTexture = tex };
            m.SetFloat("_SrcBlend", (float)UnityEngine.Rendering.BlendMode.SrcAlpha);
            m.SetFloat("_DstBlend", (float)UnityEngine.Rendering.BlendMode.OneMinusSrcAlpha);
            m.SetFloat("_ZWrite", 0);
            m.renderQueue = 3000;
            return m;
        }

        void MakeSea()
        {
            // Water all the way to the horizon, and sand under it.
            var water = new GameObject("Sea");
            water.transform.SetParent(transform, false);
            water.AddComponent<MeshFilter>().sharedMesh = Flat(300, new Color32(255, 255, 255, 255));
            water.AddComponent<MeshRenderer>().sharedMaterial = waterMat;
            water.transform.position = new Vector3(VoxelWorld.SX / 2f, VoxelWorld.Sea - 0.12f, VoxelWorld.SZ / 2f);
            var bed = new GameObject("Sea bed");
            bed.transform.SetParent(transform, false);
            bed.AddComponent<MeshFilter>().sharedMesh = Flat(300, new Color32(150, 138, 100, 255));
            bed.AddComponent<MeshRenderer>().sharedMaterial = solidMat;
            bed.transform.position = new Vector3(VoxelWorld.SX / 2f, VoxelWorld.Sea - 3.05f, VoxelWorld.SZ / 2f);
        }

        // A flat square facing up.
        static Mesh Flat(float size, Color32 c)
        {
            var m = new Mesh();
            float h = size / 2;
            m.SetVertices(new List<Vector3> { new Vector3(-h, 0, -h), new Vector3(-h, 0, h), new Vector3(h, 0, h), new Vector3(h, 0, -h) });
            m.SetUVs(0, new List<Vector2> { new Vector2(0, 0), new Vector2(0, 1), new Vector2(1, 1), new Vector2(1, 0) });
            m.SetColors(new List<Color32> { c, c, c, c });
            m.SetTriangles(new List<int> { 0, 1, 2, 0, 2, 3 }, 0);
            m.RecalculateBounds();
            return m;
        }

        void MakeClouds()
        {
            var b = new Boxes();
            var r = new Rng(77);
            var white = new Color32(255, 255, 255, 255);
            for (int i = 0; i < 14; i++)
            {
                Vector3 c = new Vector3(r.Range(-60f, 124f), r.Range(34f, 40f), r.Range(-60f, 124f));
                int parts = r.Range(2, 5);
                for (int k = 0; k < parts; k++) b.Add(c + new Vector3(r.Range(-6f, 6f), 0, r.Range(-5f, 5f)), new Vector3(r.Range(6f, 12f), 1.5f, r.Range(5f, 9f)), white);
            }
            b.Make("Clouds", transform, solidMat);
        }

        void MakeHud()
        {
            // On the back of your left wrist, like a watch.
            wrist = new TextPanel("Wrist", transform, transparentMat, 0.16f, 160, 100, new Color32(12, 12, 16, 190));
            // Big messages in front of you.
            banner = new TextPanel("Banner", transform, transparentMat, 1.6f, 320, 80, new Color32(0, 0, 0, 0));
            banner.Visible = false;
            bossBar = new TextPanel("Boss", transform, transparentMat, 1.2f, 240, 40, new Color32(0, 0, 0, 0));
            bossBar.Visible = false;
            // The title and game over board.
            menu = new TextPanel("Menu", transform, transparentMat, 2.4f, 320, 240, new Color32(18, 16, 14, 225));
            menuT = menu.t;
            // A red flash when you get hit.
            var hq = new GameObject("Hurt");
            hq.transform.SetParent(player.head, false);
            hq.transform.localPosition = new Vector3(0, 0, 0.09f);
            hq.AddComponent<MeshFilter>().sharedMesh = Boxes.Quad(0.6f, 0.6f);
            hurtMat = new Material(transparentMat);
            hurtMat.renderQueue = 4000;
            hq.AddComponent<MeshRenderer>().sharedMaterial = hurtMat;
            hurtQuad = hq.transform;
        }

        void PlaceAtStart()
        {
            int mx = VoxelWorld.SX / 2, mz = VoxelWorld.SZ / 2;
            player.Place(new Vector3(mx + 0.5f, world.Ground(mx, mz), mz + 0.5f), 0);
        }

        // --- Screens ---

        void ShowTitle()
        {
            state = State.Title;
            stateT = 0;
            PutMenuInFront(3.2f);
            menu.Visible = true;
            DrawMenu(true);
        }

        void DrawMenu(bool title)
        {
            var gold = new Color32(255, 210, 63, 255);
            var white = new Color32(245, 240, 228, 255);
            var dim = new Color32(190, 180, 160, 255);
            var ember = new Color32(255, 122, 47, 255);
            menu.Clear();
            if (title)
            {
                menu.TextAt("BLOCK", 34, 14, 5, white);
                menu.TextAt("FIRE", 184, 14, 5, ember);
                menu.Text("V R", 58, 3, gold);
                menu.Text("THE MOSSHEADS ARE COMING", 92, 1, dim);
                menu.Text("RIGHT TRIGGER: SHOOT   B: RELOAD", 112, 1, white);
                menu.Text("LEFT STICK: WALK   RIGHT STICK: TURN", 124, 1, white);
                menu.Text("A: JUMP   RIGHT STICK CLICK: SWAP GUN", 136, 1, white);
                menu.Text("LEFT TRIGGER: BUILD   LEFT GRIP: BREAK", 148, 1, white);
                menu.Text("X: CHANGE BLOCK   MENU: PAUSE", 160, 1, white);
                if (best > 0) menu.Text("BEST SCORE " + best, 184, 2, gold);
                menu.Text("PULL THE TRIGGER TO START", 212, 2, gold);
            }
            else
            {
                menu.Text("YOU GOT CUBED!", 24, 3, new Color32(255, 90, 70, 255));
                menu.Text("WAVE " + wave, 76, 3, white);
                menu.Text("SCORE " + score, 112, 3, gold);
                menu.Text(score >= best && score > 0 ? "NEW BEST!" : "BEST " + best, 148, 2, score >= best && score > 0 ? gold : dim);
                menu.Text("PULL THE TRIGGER TO PLAY AGAIN", 206, 1, white);
            }
            menu.Apply();
        }

        void PutMenuInFront(float dist)
        {
            Vector3 f = player.head.forward;
            f.y = 0;
            if (f.sqrMagnitude < 0.01f) f = Vector3.forward;
            f.Normalize();
            menuT.position = player.head.position + f * dist;
            menuT.rotation = Quaternion.LookRotation(f);
        }

        void Banner(string text, Color32 color, float seconds)
        {
            banner.Clear();
            // As big as fits.
            int scale = 5;
            while (scale > 2 && PixelFont.Width(text, scale) > 312) scale--;
            banner.Text(text, (80 - 7 * scale) / 2, scale, color);
            banner.Apply();
            banner.Changed(null);
            banner.Visible = true;
            bannerT = seconds;
        }

        // --- Playing ---

        void StartGame()
        {
            foreach (var m in mobs) if (m != null) Destroy(m.gameObject);
            mobs.Clear();
            queue.Clear();
            boss = null;
            wave = 0;
            score = 0;
            kills = 0;
            player.Revive();
            gun.Refill();
            PlaceAtStart();
            menu.Visible = false;
            state = State.Playing;
            resting = true;
            restT = 2.5f;
            sfx.Play(sfx.start);
            Banner("GET READY", new Color32(255, 210, 63, 255), 2);
        }

        void NextWave()
        {
            wave++;
            resting = false;
            int n = 3 + wave * 2;
            bool bossWave = wave % 5 == 0;
            if (bossWave)
            {
                queue.Add(MobKind.King);
                n /= 2;
            }
            for (int i = 0; i < n; i++)
            {
                float r = rng.Next();
                MobKind k = MobKind.Mosshead;
                if (wave >= 2 && r < 0.25f) k = MobKind.Mini;
                else if (wave >= 3 && r < 0.45f) k = MobKind.Bone;
                else if (wave >= 4 && r < 0.55f) k = MobKind.Giant;
                queue.Add(k);
            }
            spawnT = 0.5f;
            if (bossWave)
            {
                sfx.Play(sfx.boss);
                Banner("BOSS WAVE!", new Color32(255, 90, 70, 255), 2.5f);
            }
            else
            {
                sfx.Play(sfx.wave);
                Banner("WAVE " + wave, new Color32(245, 240, 228, 255), 2);
            }
        }

        void Spawn(MobKind k)
        {
            Vector3 at;
            world.LandSpot(player.Feet, 14, 28, rng, out at);
            var go = new GameObject(k.ToString());
            go.transform.SetParent(transform, false);
            go.transform.position = at;
            go.transform.rotation = Quaternion.LookRotation(Flat(player.Feet - at));
            var mob = go.AddComponent<Mob>();
            // Tougher every wave.
            mob.Init(this, k, 1 + (wave - 1) * 0.12f);
            mobs.Add(mob);
            if (k == MobKind.King) boss = mob;
            fx.Burst(at + Vector3.up * mob.scale, new Color32(160, 140, 200, 255), 10, 2.5f, 0.1f * mob.scale);
        }

        static Vector3 Flat(Vector3 v)
        {
            v.y = 0;
            return v.sqrMagnitude < 0.001f ? Vector3.forward : v;
        }

        public void OnMobDied(Mob m)
        {
            kills++;
            score += m.points * (1 + wave / 5);
            sfx.At(sfx.mobDie, m.transform.position);
            if (m == boss)
            {
                boss = null;
                Banner("BOSS DOWN!", new Color32(255, 210, 63, 255), 2.5f);
                player.hp = Player.MaxHp;
            }
        }

        public void HurtPlayer(int dmg, Vector3 from)
        {
            if (state != State.Playing || player.dead) return;
            sfx.Play(sfx.hurt);
            controls.Buzz(false, 0.8f, 0.15f);
            controls.Buzz(true, 0.8f, 0.15f);
            if (player.Hurt(dmg, from))
            {
                state = State.Dead;
                stateT = 0;
                sfx.Play(sfx.death);
                if (score > best)
                {
                    best = score;
                    PlayerPrefs.SetInt("bf_vr_best", best);
                    PlayerPrefs.Save();
                }
                PutMenuInFront(2.6f);
                DrawMenu(false);
                menu.Visible = true;
            }
        }

        void Update()
        {
            controls.Update();
            float dt = Mathf.Min(Time.unscaledDeltaTime, 0.05f);
            if (controls.pause && state == State.Playing) paused = !paused;
            if (paused) dt = 0;
            if (controls.hud) wristOn = !wristOn;

            bool playing = state == State.Playing && !paused;
            player.Tick(controls, dt, !playing);
            gun.Tick(controls, dt, playing);
            builder.Tick(controls, dt, playing);
            fx.Update(dt);
            stateT += Time.unscaledDeltaTime;

            // The headset takes a moment to say where your head really is:
            // keep the title board in front of you until it has.
            if (state == State.Title && stateT < 1.5f) PutMenuInFront(3.2f);
            if (state == State.Title && stateT > 0.5f && controls.start) StartGame();
            else if (state == State.Dead && stateT > 2f && controls.start) StartGame();

            if (playing) UpdateWaves(dt);
            for (int i = mobs.Count - 1; i >= 0; i--)
            {
                if (mobs[i] == null)
                {
                    mobs.RemoveAt(i);
                    continue;
                }
                if (!paused) mobs[i].Tick(dt, player);
            }
            UpdateHud(dt);
        }

        void UpdateWaves(float dt)
        {
            if (resting)
            {
                restT -= dt;
                if (restT <= 0) NextWave();
                return;
            }
            if (queue.Count > 0)
            {
                spawnT -= dt;
                // Not too many at once.
                if (spawnT <= 0 && Alive() < 10)
                {
                    spawnT = 0.7f;
                    Spawn(queue[0]);
                    queue.RemoveAt(0);
                }
                return;
            }
            if (Alive() == 0)
            {
                resting = true;
                restT = 4;
                score += wave * 20;
                sfx.Play(sfx.start);
                Banner("WAVE " + wave + " CLEARED!", new Color32(111, 211, 90, 255), 2.5f);
            }
        }

        int Alive()
        {
            int n = 0;
            foreach (var m in mobs) if (m != null && !m.dying) n++;
            return n;
        }

        // The watch sits on the back of your left wrist and turns to face you.
        void PlaceWrist()
        {
            if (wrist == null || !wrist.Visible) return;
            var l = player.left;
            wrist.t.position = l.position + l.rotation * new Vector3(0, 0.05f, -0.12f);
            wrist.t.rotation = Quaternion.LookRotation(wrist.t.position - player.head.position, l.up);
        }

        void UpdateHud(float dt)
        {
            var head = player.head;
            // The watch on your wrist.
            bool showWrist = wristOn && state == State.Playing;
            wrist.Visible = showWrist;
            if (showWrist)
            {
                PlaceWrist();
                string key = player.hp + "|" + wave + "|" + (Alive() + queue.Count) + "|" + score + "|" + builder.Block + "|" + paused;
                if (wrist.Changed(key))
                {
                    wrist.Clear();
                    for (int i = 0; i < 10; i++)
                    {
                        int fill = player.hp >= (i + 1) * 2 ? 2 : player.hp == i * 2 + 1 ? 1 : 0;
                        wrist.Heart(8 + i * 15, 6, 2, fill);
                    }
                    var white = new Color32(245, 240, 228, 255);
                    wrist.TextAt("WAVE " + wave, 8, 26, 2, new Color32(255, 210, 63, 255));
                    wrist.TextAt("MOBS " + (Alive() + queue.Count), 8, 46, 2, white);
                    wrist.TextAt("SCORE " + score, 8, 66, 2, white);
                    wrist.TextAt(paused ? "PAUSED" : Blocks.Names[builder.Block].ToUpperInvariant(), 8, 86, 1, paused ? new Color32(255, 90, 70, 255) : new Color32(190, 180, 160, 255));
                    wrist.Apply();
                }
            }

            // Messages float in front of you and follow your head gently.
            Vector3 f = head.forward;
            f.y = Mathf.Clamp(f.y, -0.3f, 0.3f);
            f.Normalize();
            Vector3 want = head.position + f * 3f + Vector3.up * 0.35f;
            if (bannerT > 0 || paused)
            {
                if (paused && bannerT <= 0)
                {
                    Banner("PAUSED", new Color32(245, 240, 228, 255), 0.1f);
                }
                bannerT -= dt;
                banner.t.position = Vector3.Lerp(banner.t.position, want, Mathf.Min(1, Time.unscaledDeltaTime * (banner.Visible ? 4 : 100)));
                banner.t.rotation = Quaternion.LookRotation(banner.t.position - head.position);
                if (bannerT <= 0 && !paused) banner.Visible = false;
            }

            // The boss's health.
            bool showBoss = boss != null && !boss.dying && state == State.Playing;
            bossBar.Visible = showBoss;
            if (showBoss)
            {
                bossBar.t.position = boss.transform.position + Vector3.up * (boss.scale * 2.1f + 0.4f);
                bossBar.t.rotation = Quaternion.LookRotation(bossBar.t.position - head.position);
                string key = ((int)boss.hp).ToString();
                if (bossBar.Changed(key))
                {
                    bossBar.Clear();
                    bossBar.Text("MOSS KING", 2, 2, new Color32(255, 210, 63, 255));
                    bossBar.Bar(20, 22, 200, 10, boss.hp / boss.maxHp, new Color32(224, 64, 47, 255));
                    bossBar.Apply();
                }
            }

            // The menu turns to face you.
            if (menu.Visible) menuT.rotation = Quaternion.LookRotation(menuT.position - head.position);

            // Red when you're hit, and darker when you're out.
            float a = player.hurtFlash * 0.45f + (state == State.Dead ? 0.35f : 0);
            hurtMat.color = new Color(0.8f, 0.05f, 0.02f, a);
            hurtQuad.gameObject.SetActive(a > 0.01f);
        }
    }
}
