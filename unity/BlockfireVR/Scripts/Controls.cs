using System.Collections.Generic;
using UnityEngine;
using UnityEngine.XR;

namespace BlockfireVR
{
    // What the player is pressing this frame, from a VR headset and its two
    // controllers, or (with no headset) from a keyboard and mouse so you can
    // try the game in the Unity editor.
    //
    // Meta Quest (Touch controllers)
    //   Left stick     walk (click it to run)        Right stick    turn
    //   Right trigger  shoot                         A              jump
    //   B              reload                        Right stick click  swap guns
    //   Left trigger   place a block                 Left grip      break a block
    //   X              change block                  Y              wrist HUD on/off
    //   Menu (left)    pause
    //
    // Keyboard and mouse
    //   WASD walk, Shift run, mouse look (click to grab the mouse), Space jump,
    //   left click shoot, right click place, F break, R reload, Q swap guns,
    //   E change block, Esc pause (and let go of the mouse), Enter start
    public class Controls
    {
        public bool xr;

        public Vector2 move;
        public float turn;
        public Vector2 look;
        public bool run, jump, jumpHeld, fire, fireDown, reload, swap, place, dig, digHeld, nextBlock, hud, pause, start;

        // Poses relative to the play space (the XR rig).
        public Vector3 headPos;
        public Quaternion headRot = Quaternion.identity;
        public Vector3 rightPos, leftPos;
        public Quaternion rightRot = Quaternion.identity, leftRot = Quaternion.identity;
        public bool rightTracked, leftTracked;

        InputDevice head, left, right;
        readonly Dictionary<string, bool> was = new Dictionary<string, bool>();
        bool runToggle;
        static readonly InputFeatureUsage<Vector3> PointerPosition = new InputFeatureUsage<Vector3>("PointerPosition");
        static readonly InputFeatureUsage<Quaternion> PointerRotation = new InputFeatureUsage<Quaternion>("PointerRotation");

        public void Update()
        {
            xr = XRSettings.isDeviceActive;
            move = Vector2.zero;
            turn = 0;
            look = Vector2.zero;
            jump = jumpHeld = fire = fireDown = reload = swap = place = dig = digHeld = nextBlock = hud = pause = start = false;
            if (xr) ReadXR();
            else ReadDesktop();
        }

        // Pressed this frame (not held from before).
        bool Edge(string key, bool now)
        {
            bool before;
            was.TryGetValue(key, out before);
            was[key] = now;
            return now && !before;
        }

        static bool Button(InputDevice d, InputFeatureUsage<bool> u)
        {
            bool v;
            return d.isValid && d.TryGetFeatureValue(u, out v) && v;
        }

        static float Axis(InputDevice d, InputFeatureUsage<float> u)
        {
            float v;
            return d.isValid && d.TryGetFeatureValue(u, out v) ? v : 0;
        }

        static Vector2 Stick(InputDevice d)
        {
            Vector2 v;
            return d.isValid && d.TryGetFeatureValue(CommonUsages.primary2DAxis, out v) ? v : Vector2.zero;
        }

        // Where a controller points: its aim pose if the headset has one,
        // otherwise its grip.
        static bool Pose(InputDevice d, out Vector3 p, out Quaternion r)
        {
            p = Vector3.zero;
            r = Quaternion.identity;
            if (!d.isValid) return false;
            if (d.TryGetFeatureValue(PointerPosition, out p) && d.TryGetFeatureValue(PointerRotation, out r)) return true;
            return d.TryGetFeatureValue(CommonUsages.devicePosition, out p) && d.TryGetFeatureValue(CommonUsages.deviceRotation, out r);
        }

        // Where your head and hands are. Also called again just before each
        // frame is drawn.
        public void ReadPoses()
        {
            if (!head.isValid) head = InputDevices.GetDeviceAtXRNode(XRNode.Head);
            if (!left.isValid) left = InputDevices.GetDeviceAtXRNode(XRNode.LeftHand);
            if (!right.isValid) right = InputDevices.GetDeviceAtXRNode(XRNode.RightHand);
            Vector3 hp;
            Quaternion hr;
            if (head.isValid)
            {
                if (head.TryGetFeatureValue(CommonUsages.centerEyePosition, out hp) || head.TryGetFeatureValue(CommonUsages.devicePosition, out hp)) headPos = hp;
                if (head.TryGetFeatureValue(CommonUsages.centerEyeRotation, out hr) || head.TryGetFeatureValue(CommonUsages.deviceRotation, out hr)) headRot = hr;
            }
            // A hand that isn't tracked (put down, or out of view) stays
            // where it was last seen.
            Vector3 p;
            Quaternion r;
            rightTracked = Pose(right, out p, out r);
            if (rightTracked)
            {
                rightPos = p;
                rightRot = r;
            }
            leftTracked = Pose(left, out p, out r);
            if (leftTracked)
            {
                leftPos = p;
                leftRot = r;
            }
        }

        void ReadXR()
        {
            ReadPoses();
            move = Stick(left);
            if (move.magnitude < 0.15f) move = Vector2.zero;
            turn = Stick(right).x;
            if (Edge("lclick", Button(left, CommonUsages.primary2DAxisClick))) runToggle = !runToggle;
            if (move == Vector2.zero) runToggle = false;
            run = runToggle;
            bool fireNow = Axis(right, CommonUsages.trigger) > 0.55f || Button(right, CommonUsages.triggerButton);
            fire = fireNow;
            fireDown = Edge("fire", fireNow);
            jumpHeld = Button(right, CommonUsages.primaryButton);
            jump = Edge("jump", jumpHeld);
            reload = Edge("reload", Button(right, CommonUsages.secondaryButton));
            swap = Edge("swap", Button(right, CommonUsages.primary2DAxisClick));
            bool placeNow = Axis(left, CommonUsages.trigger) > 0.55f || Button(left, CommonUsages.triggerButton);
            place = Edge("place", placeNow);
            digHeld = Axis(left, CommonUsages.grip) > 0.55f || Button(left, CommonUsages.gripButton);
            dig = Edge("dig", digHeld);
            nextBlock = Edge("next", Button(left, CommonUsages.primaryButton));
            hud = Edge("hud", Button(left, CommonUsages.secondaryButton));
            pause = Edge("pause", Button(left, CommonUsages.menuButton));
            start = fireDown || jump;
        }

        // A short buzz in a controller.
        public void Buzz(bool rightHand, float strength, float seconds)
        {
            var d = rightHand ? right : left;
            if (xr && d.isValid) d.SendHapticImpulse(0, strength, seconds);
        }

        void ReadDesktop()
        {
#if ENABLE_INPUT_SYSTEM
            var k = UnityEngine.InputSystem.Keyboard.current;
            var m = UnityEngine.InputSystem.Mouse.current;
            if (k == null || m == null) return;
            move = new Vector2((k.dKey.isPressed ? 1 : 0) - (k.aKey.isPressed ? 1 : 0), (k.wKey.isPressed ? 1 : 0) - (k.sKey.isPressed ? 1 : 0));
            run = k.leftShiftKey.isPressed;
            jumpHeld = k.spaceKey.isPressed;
            jump = k.spaceKey.wasPressedThisFrame;
            reload = k.rKey.wasPressedThisFrame;
            swap = k.qKey.wasPressedThisFrame;
            dig = k.fKey.wasPressedThisFrame;
            digHeld = k.fKey.isPressed;
            nextBlock = k.eKey.wasPressedThisFrame;
            hud = k.hKey.wasPressedThisFrame;
            pause = k.escapeKey.wasPressedThisFrame;
            bool locked = Cursor.lockState == CursorLockMode.Locked;
            if (locked) look = m.delta.ReadValue() * 0.1f;
            fire = locked && m.leftButton.isPressed;
            fireDown = locked && m.leftButton.wasPressedThisFrame;
            place = locked && m.rightButton.wasPressedThisFrame;
            start = k.enterKey.wasPressedThisFrame || k.spaceKey.wasPressedThisFrame || (locked && fireDown);
            if (!locked && m.leftButton.wasPressedThisFrame) Cursor.lockState = CursorLockMode.Locked;
#elif ENABLE_LEGACY_INPUT_MANAGER
            move = new Vector2((Input.GetKey(KeyCode.D) ? 1 : 0) - (Input.GetKey(KeyCode.A) ? 1 : 0), (Input.GetKey(KeyCode.W) ? 1 : 0) - (Input.GetKey(KeyCode.S) ? 1 : 0));
            run = Input.GetKey(KeyCode.LeftShift);
            jumpHeld = Input.GetKey(KeyCode.Space);
            jump = Input.GetKeyDown(KeyCode.Space);
            reload = Input.GetKeyDown(KeyCode.R);
            swap = Input.GetKeyDown(KeyCode.Q);
            dig = Input.GetKeyDown(KeyCode.F);
            digHeld = Input.GetKey(KeyCode.F);
            nextBlock = Input.GetKeyDown(KeyCode.E);
            hud = Input.GetKeyDown(KeyCode.H);
            pause = Input.GetKeyDown(KeyCode.Escape);
            bool locked = Cursor.lockState == CursorLockMode.Locked;
            if (locked) look = new Vector2(Input.GetAxisRaw("Mouse X"), Input.GetAxisRaw("Mouse Y")) * 2f;
            fire = locked && Input.GetMouseButton(0);
            fireDown = locked && Input.GetMouseButtonDown(0);
            place = locked && Input.GetMouseButtonDown(1);
            start = Input.GetKeyDown(KeyCode.Return) || Input.GetKeyDown(KeyCode.Space) || (locked && fireDown);
            if (!locked && Input.GetMouseButtonDown(0)) Cursor.lockState = CursorLockMode.Locked;
#endif
            if (pause) Cursor.lockState = CursorLockMode.None;
        }
    }
}
