using System.Collections.Generic;
using UnityEngine;
using UnityEngine.XR;

namespace BlockfireVR
{
    // You: the play space (with a capsule that bumps into things), your head
    // (the camera) and your two hands. Walk with the stick, turn in quick
    // snaps (kinder on your tummy than smooth turning), jump, swim.
    public class Player
    {
        public readonly Transform root, head, left, right;
        public readonly Camera cam;
        public readonly CharacterController cc;
        public int hp = 20;
        public const int MaxHp = 20;
        public float hurtFlash;
        public bool dead;
        public Vector3 lastHitFrom;

        float vy;
        float regenT;
        bool turned;
        float deskYaw, deskPitch;
        readonly VoxelWorld world;

        public Player(Transform parent, VoxelWorld world)
        {
            this.world = world;
            root = new GameObject("Player").transform;
            root.SetParent(parent, false);
            // Our own collider mustn't block our own bullets.
            root.gameObject.layer = 2;
            cc = root.gameObject.AddComponent<CharacterController>();
            cc.radius = 0.3f;
            cc.height = 1.7f;
            cc.center = new Vector3(0, 0.87f, 0);
            cc.stepOffset = 0.45f;
            cc.skinWidth = 0.03f;
            cc.slopeLimit = 50;

            head = new GameObject("Head").transform;
            head.SetParent(root, false);
            head.localPosition = new Vector3(0, 1.62f, 0);
            cam = head.gameObject.AddComponent<Camera>();
            cam.tag = "MainCamera";
            cam.nearClipPlane = 0.04f;
            cam.farClipPlane = 250;
            cam.clearFlags = CameraClearFlags.SolidColor;
            head.gameObject.AddComponent<AudioListener>();

            left = new GameObject("Left hand").transform;
            left.SetParent(root, false);
            right = new GameObject("Right hand").transform;
            right.SetParent(root, false);
        }

        public Vector3 Feet
        {
            get { return root.position; }
        }

        public bool InWater
        {
            get { return root.position.y < VoxelWorld.Sea - 0.2f; }
        }

        // Standing on the floor: tell the headset to measure heights from the
        // floor, so your real height is your height in the game. If it can't,
        // lift everything up to a normal standing height instead.
        public float lift;
        bool floorKnown;
        float floorRetry;
        readonly List<XRInputSubsystem> subsystems = new List<XRInputSubsystem>();

        public void UseFloorLevel()
        {
            SubsystemManager.GetSubsystems(subsystems);
            bool floor = false;
            foreach (var s in subsystems)
            {
                if (s.TrySetTrackingOriginMode(TrackingOriginModeFlags.Floor) || s.GetTrackingOriginMode() == TrackingOriginModeFlags.Floor) floor = true;
            }
            floorKnown = subsystems.Count > 0;
            lift = floorKnown && !floor ? 1.6f : 0;
        }

        public void Place(Vector3 feet, float yaw)
        {
            cc.enabled = false;
            root.position = feet;
            root.rotation = Quaternion.Euler(0, yaw, 0);
            deskYaw = yaw;
            deskPitch = 0;
            cc.enabled = true;
            vy = 0;
        }

        public void ApplyPoses(Controls c)
        {
            Vector3 up = new Vector3(0, lift, 0);
            head.localPosition = c.headPos + up;
            head.localRotation = c.headRot;
            right.localPosition = c.rightPos + up;
            right.localRotation = c.rightRot;
            left.localPosition = c.leftPos + up;
            left.localRotation = c.leftRot;
        }

        public void Tick(Controls c, float dt, bool frozen)
        {
            // Head and hands.
            if (c.xr)
            {
                // The headset may still be starting up: keep asking about the floor.
                if (!floorKnown && (floorRetry -= dt) <= 0)
                {
                    floorRetry = 1;
                    UseFloorLevel();
                }
                ApplyPoses(c);
            }
            else
            {
                // No headset: mouse look, hands held out in front.
                deskYaw += c.look.x;
                deskPitch = Mathf.Clamp(deskPitch - c.look.y, -85, 85);
                root.rotation = Quaternion.Euler(0, deskYaw, 0);
                head.localPosition = new Vector3(0, 1.62f, 0);
                head.localRotation = Quaternion.Euler(deskPitch, 0, 0);
                right.position = head.TransformPoint(new Vector3(0.22f, -0.22f, 0.42f));
                right.rotation = head.rotation;
                left.position = head.TransformPoint(new Vector3(-0.24f, -0.24f, 0.4f));
                left.rotation = head.rotation;
            }
            // The capsule follows your head round the play space, and is as
            // tall as you are.
            Vector3 hl = head.localPosition;
            float tall = Mathf.Clamp(hl.y + 0.12f, 1.0f, 2.1f);
            cc.height = tall;
            cc.center = new Vector3(hl.x, tall / 2 + cc.skinWidth, hl.z);

            if (frozen || dead)
            {
                vy = 0;
                return;
            }

            // Snap turning round your head.
            if (c.xr)
            {
                if (!turned && Mathf.Abs(c.turn) > 0.7f)
                {
                    turned = true;
                    Vector3 hp = head.position;
                    cc.enabled = false;
                    root.RotateAround(hp, Vector3.up, c.turn > 0 ? 45 : -45);
                    cc.enabled = true;
                }
                if (Mathf.Abs(c.turn) < 0.3f) turned = false;
            }

            // Walking, where you're looking.
            Vector3 fwd = head.forward;
            fwd.y = 0;
            if (fwd.sqrMagnitude < 0.001f) fwd = root.forward;
            fwd.Normalize();
            Vector3 side = Vector3.Cross(Vector3.up, fwd);
            float speed = c.run ? 6.2f : 4.2f;
            bool water = InWater;
            if (water) speed *= 0.55f;
            Vector3 v = (fwd * c.move.y + side * c.move.x) * speed;

            if (water)
            {
                // Swim: hold jump to go up.
                vy = c.jumpHeld ? 3.2f : Mathf.Max(vy - 8 * dt, -2.2f);
            }
            else if (cc.isGrounded)
            {
                vy = -1;
                if (c.jump) vy = 7.4f;
            }
            else vy -= 22 * dt;
            v.y = vy;
            var flags = cc.Move(v * dt);
            if ((flags & CollisionFlags.Above) != 0 && vy > 0) vy = 0;

            // Fell off the world somehow: back to the middle.
            if (root.position.y < -8)
            {
                int mx = VoxelWorld.SX / 2, mz = VoxelWorld.SZ / 2;
                Place(new Vector3(mx + 0.5f, world.Ground(mx, mz), mz + 0.5f), root.eulerAngles.y);
            }

            // Hearts come back slowly.
            hurtFlash = Mathf.Max(0, hurtFlash - dt * 2.5f);
            regenT += dt;
            if (regenT > 4 && hp < MaxHp)
            {
                regenT = 0;
                hp++;
            }
        }

        // Got hit. Returns true if that knocked you out.
        public bool Hurt(int dmg, Vector3 from)
        {
            if (dead) return false;
            hp -= dmg;
            regenT = -3;
            hurtFlash = 1;
            lastHitFrom = from;
            // A little shove away from whatever hit you.
            Vector3 push = root.position - from;
            push.y = 0;
            if (push.sqrMagnitude > 0.001f && cc.enabled) cc.Move(push.normalized * 0.4f);
            if (hp <= 0)
            {
                hp = 0;
                dead = true;
                return true;
            }
            return false;
        }

        public void Revive()
        {
            hp = MaxHp;
            dead = false;
            hurtFlash = 0;
            regenT = 0;
        }
    }
}
