using UnityEngine;

namespace BlockfireVR
{
    // The guns in your right hand. Aim by pointing your hand, pull the
    // trigger to shoot, B to reload, click the right stick to swap.
    public class Gun
    {
        class Kind
        {
            public string name;
            public int mag, pellets;
            public float rate, dmg, spread, reload, kick;
            public bool auto;
            public Transform model, muzzle, flash;
        }

        readonly Kind[] kinds;
        readonly int[] ammo;
        readonly Transform hand;
        readonly TextPanel panel;
        readonly Game game;
        int cur;
        float cool, reloadT, recoil, flashT;
        Transform holder;

        public Gun(Game g, Transform hand)
        {
            game = g;
            this.hand = hand;
            holder = new GameObject("Guns").transform;
            holder.SetParent(hand, false);
            kinds = new[]
            {
                new Kind { name = "EMBER BLASTER", mag = 24, pellets = 1, rate = 0.11f, dmg = 7, spread = 0.6f, reload = 1.4f, kick = 0.035f, auto = true },
                new Kind { name = "BOOM SHOTGUN", mag = 6, pellets = 8, rate = 0.75f, dmg = 5, spread = 5f, reload = 2.0f, kick = 0.09f, auto = false },
            };
            ammo = new int[kinds.Length];
            for (int i = 0; i < kinds.Length; i++) ammo[i] = kinds[i].mag;
            BuildBlaster(kinds[0]);
            BuildShotgun(kinds[1]);
            panel = new TextPanel("Ammo", holder, g.transparentMat, 0.11f, 96, 40, new Color32(10, 10, 12, 170));
            panel.t.localPosition = new Vector3(0, 0.075f, -0.02f);
            panel.t.localRotation = Quaternion.Euler(35, 0, 0);
            Select(0);
        }

        // The Ember Blaster: dark body, an orange glowing stripe, a scope.
        void BuildBlaster(Kind k)
        {
            var dark = Boxes.Hex("#3a3f48");
            var mid = Boxes.Hex("#5b6370");
            var ember = Boxes.Hex("#ff7a2f");
            var b = new Boxes()
                .Add(new Vector3(0, 0.0f, 0.05f), new Vector3(0.05f, 0.07f, 0.26f), dark)
                .Add(new Vector3(0, 0.005f, 0.23f), new Vector3(0.03f, 0.03f, 0.14f), mid)
                .Add(new Vector3(0, -0.075f, -0.02f), new Vector3(0.04f, 0.1f, 0.05f), dark, Quaternion.Euler(-15, 0, 0))
                .Add(new Vector3(0, -0.06f, 0.08f), new Vector3(0.035f, 0.08f, 0.05f), mid)
                .Add(new Vector3(0.026f, 0.01f, 0.06f), new Vector3(0.004f, 0.015f, 0.18f), ember)
                .Add(new Vector3(-0.026f, 0.01f, 0.06f), new Vector3(0.004f, 0.015f, 0.18f), ember)
                .Add(new Vector3(0, 0.055f, 0.04f), new Vector3(0.03f, 0.03f, 0.09f), dark)
                .Add(new Vector3(0, 0.055f, 0.087f), new Vector3(0.022f, 0.022f, 0.004f), Boxes.Hex("#6fd3ff"));
            k.model = b.Make(k.name, holder, game.solidMat).transform;
            k.muzzle = Muzzle(k.model, 0.31f);
            k.flash = Flash(k.model, 0.33f, 0.07f);
        }

        // The Boom Shotgun: a fat double barrel and a wooden stock.
        void BuildShotgun(Kind k)
        {
            var metal = Boxes.Hex("#4a4d52");
            var wood = Boxes.Hex("#8a5a33");
            var b = new Boxes()
                .Add(new Vector3(-0.014f, 0.01f, 0.17f), new Vector3(0.026f, 0.026f, 0.36f), metal)
                .Add(new Vector3(0.014f, 0.01f, 0.17f), new Vector3(0.026f, 0.026f, 0.36f), metal)
                .Add(new Vector3(0, -0.012f, 0.1f), new Vector3(0.05f, 0.03f, 0.14f), wood)
                .Add(new Vector3(0, -0.015f, -0.04f), new Vector3(0.05f, 0.06f, 0.1f), metal)
                .Add(new Vector3(0, -0.07f, -0.06f), new Vector3(0.04f, 0.1f, 0.05f), wood, Quaternion.Euler(-20, 0, 0))
                .Add(new Vector3(0, -0.035f, -0.16f), new Vector3(0.045f, 0.07f, 0.16f), wood, Quaternion.Euler(8, 0, 0));
            k.model = b.Make(k.name, holder, game.solidMat).transform;
            k.muzzle = Muzzle(k.model, 0.36f);
            k.flash = Flash(k.model, 0.38f, 0.1f);
        }

        Transform Muzzle(Transform model, float z)
        {
            var m = new GameObject("Muzzle").transform;
            m.SetParent(model, false);
            m.localPosition = new Vector3(0, 0.01f, z);
            return m;
        }

        Transform Flash(Transform model, float z, float size)
        {
            var f = new Boxes()
                .Add(Vector3.zero, new Vector3(size, size * 0.4f, size * 0.4f), Boxes.Hex("#fff2b0"))
                .Add(Vector3.zero, new Vector3(size * 0.4f, size, size * 0.4f), Boxes.Hex("#ffb040"))
                .Make("Flash", model, game.glowMat).transform;
            f.localPosition = new Vector3(0, 0.01f, z);
            f.gameObject.SetActive(false);
            return f;
        }

        void Select(int i)
        {
            cur = i;
            reloadT = 0;
            for (int k = 0; k < kinds.Length; k++) kinds[k].model.gameObject.SetActive(k == i);
            game.sfx.Play(game.sfx.click);
        }

        public string Name
        {
            get { return kinds[cur].name; }
        }

        public void Refill()
        {
            for (int i = 0; i < kinds.Length; i++) ammo[i] = kinds[i].mag;
            reloadT = 0;
        }

        public void Tick(Controls c, float dt, bool canShoot)
        {
            var k = kinds[cur];
            cool -= dt;
            flashT -= dt;
            k.flash.gameObject.SetActive(flashT > 0);
            if (flashT > 0) k.flash.localRotation = Quaternion.Euler(0, 0, Random.value * 90);
            recoil = Mathf.Lerp(recoil, 0, dt * 14);
            if (canShoot && c.swap) Select((cur + 1) % kinds.Length);
            // Reloading: the gun spins round once.
            if (reloadT > 0)
            {
                reloadT -= dt;
                float t = 1 - reloadT / k.reload;
                k.model.localRotation = Quaternion.Euler(-Mathf.Sin(t * Mathf.PI) * 30 + t * 360, 0, 0);
                if (reloadT <= 0)
                {
                    ammo[cur] = k.mag;
                    k.model.localRotation = Quaternion.identity;
                }
            }
            else k.model.localRotation = Quaternion.Euler(-recoil * 300, 0, 0);
            k.model.localPosition = new Vector3(0, 0, -recoil);

            if (canShoot)
            {
                if (c.reload && reloadT <= 0 && ammo[cur] < k.mag) StartReload();
                bool pull = k.auto ? c.fire : c.fireDown;
                if (pull && cool <= 0 && reloadT <= 0)
                {
                    if (ammo[cur] <= 0)
                    {
                        if (c.fireDown) game.sfx.Play(game.sfx.empty);
                        StartReload();
                    }
                    else Shoot(k);
                }
            }

            string key = ammo[cur] + "/" + k.mag + (reloadT > 0 ? "R" : "");
            if (panel.Changed(key))
            {
                panel.Clear();
                if (reloadT > 0) panel.Text("RELOAD", 12, 2, new Color32(255, 210, 63, 255));
                else panel.Text(ammo[cur] + "/" + k.mag, 8, 3, ammo[cur] == 0 ? new Color32(255, 90, 70, 255) : new Color32(255, 255, 255, 255));
                panel.Apply();
            }
        }

        void StartReload()
        {
            if (reloadT > 0) return;
            reloadT = kinds[cur].reload;
            game.sfx.Play(game.sfx.reload);
        }

        void Shoot(Kind k)
        {
            ammo[cur]--;
            cool = k.rate;
            recoil = k.kick;
            flashT = 0.05f;
            game.sfx.Play(k.pellets > 1 ? game.sfx.shotgun : game.sfx.shot, k.pellets > 1 ? 0.9f : 0.6f);
            game.controls.Buzz(true, k.pellets > 1 ? 0.9f : 0.35f, k.pellets > 1 ? 0.12f : 0.04f);
            Vector3 from = k.muzzle.position;
            Vector3 aim = hand.forward;
            bool any = false;
            for (int i = 0; i < k.pellets; i++)
            {
                Vector3 d = Quaternion.Euler(Random.Range(-k.spread, k.spread), Random.Range(-k.spread, k.spread), 0) * Vector3.forward;
                d = Quaternion.LookRotation(aim, hand.up) * d;
                RaycastHit hit;
                Vector3 end = from + d * 90;
                // Every layer but "Ignore Raycast" (you).
                if (Physics.Raycast(from - d * 0.05f, d, out hit, 90, ~(1 << 2), QueryTriggerInteraction.Ignore))
                {
                    end = hit.point;
                    var mob = hit.collider.GetComponentInParent<Mob>();
                    if (mob != null && !mob.dying)
                    {
                        bool head = hit.point.y > mob.HeadY;
                        mob.Hit(k.dmg, d, head);
                        game.fx.Burst(hit.point, Boxes.Hex("#8cc257"), 4, 1.5f, 0.05f, 0.4f);
                        if (!any)
                        {
                            game.sfx.Play(head ? game.sfx.headshot : game.sfx.hit, 0.6f);
                            any = true;
                        }
                    }
                    else
                    {
                        // Chips of whatever block it hit.
                        Vector3 inside = hit.point - hit.normal * 0.05f;
                        byte id = game.world.Get(Mathf.FloorToInt(inside.x), Mathf.FloorToInt(inside.y), Mathf.FloorToInt(inside.z));
                        game.fx.Burst(hit.point + hit.normal * 0.05f, Blocks.Chips[id], 3, 1.2f, 0.05f, 0.35f);
                    }
                }
                if (i < 3) game.fx.Line(from, end, new Color(1f, 0.85f, 0.45f, 0.9f));
            }
        }
    }
}
