using System.Collections.Generic;
using UnityEditor;
using UnityEditor.SceneManagement;
using UnityEngine;

namespace BlockfireVR.EditorTools
{
    // The "Blockfire" menu at the top of the Unity editor.
    [InitializeOnLoad]
    public static class BlockfireMenu
    {
        const string Folder = "Assets/BlockfireVR";
        const string ScenePath = Folder + "/Blockfire VR.unity";
        const string ApkPath = "Builds/BlockfireVR.apk";

        // Just imported into a project: offer to make the game scene (once).
        static BlockfireMenu()
        {
            EditorApplication.delayCall += OfferScene;
        }

        static void OfferScene()
        {
            string key = "BlockfireVR.offered." + Application.dataPath;
            if (EditorPrefs.GetBool(key, false) || EditorApplication.isPlayingOrWillChangePlaymode) return;
            EditorPrefs.SetBool(key, true);
            if (AssetDatabase.LoadAssetAtPath<SceneAsset>(ScenePath) != null) return;
            if (EditorUtility.DisplayDialog("Blockfire VR",
                "Blockfire VR is in your project! Make the game scene now?\n\n(You can do it later from the Blockfire menu at the top.)",
                "Make it", "Later"))
                MakeScene();
        }

        // A new scene with just the game in it (the game builds the island,
        // the sky, you and your hands when you press Play), first in the
        // build list so it's what the headset opens.
        [MenuItem("Blockfire/Make the game scene", false, 1)]
        public static void MakeScene()
        {
            if (AssetDatabase.LoadAssetAtPath<SceneAsset>(ScenePath) != null &&
                !EditorUtility.DisplayDialog("Blockfire VR", "The game scene is already made. Make it again from scratch?", "Make it again", "Cancel"))
                return;
            if (!EditorSceneManager.SaveCurrentModifiedScenesIfUserWantsTo()) return;
            MakeSceneNow();
            EditorUtility.DisplayDialog("Blockfire VR",
                "The game scene is ready!\n\n" +
                "With a Quest on a cable (Quest Link) or Air Link: press Play at the top of Unity and put your headset on.\n\n" +
                "No headset? Press Play anyway to try it with the keyboard and mouse.\n\n" +
                "To put it on the Quest itself: Blockfire > Build and run on Quest.", "Let's go");
        }

        static void MakeSceneNow()
        {
            if (!AssetDatabase.IsValidFolder(Folder)) AssetDatabase.CreateFolder("Assets", "BlockfireVR");
            var scene = EditorSceneManager.NewScene(NewSceneSetup.EmptyScene, NewSceneMode.Single);
            RenderSettings.fog = false;
            var go = new GameObject("Blockfire VR");
            var game = go.AddComponent<Game>();
            game.shader = Shader.Find("Blockfire/Voxel");
            if (game.shader == null)
                Debug.LogError("Blockfire VR: can't find the Blockfire/Voxel shader. Is BlockfireVR/Shaders/BlockfireVoxel.shader in your project?");
            EditorSceneManager.SaveScene(scene, ScenePath);
            PutSceneFirst();
            Selection.activeGameObject = go;
        }

        static void PutSceneFirst()
        {
            var list = new List<EditorBuildSettingsScene> { new EditorBuildSettingsScene(ScenePath, true) };
            // Keep the other scenes in the list, but switched off.
            foreach (var s in EditorBuildSettings.scenes)
                if (s.path != ScenePath) list.Add(new EditorBuildSettingsScene(s.path, false));
            EditorBuildSettings.scenes = list.ToArray();
        }

        [MenuItem("Blockfire/Open the game scene", false, 2)]
        public static void OpenScene()
        {
            if (AssetDatabase.LoadAssetAtPath<SceneAsset>(ScenePath) == null)
            {
                MakeScene();
                return;
            }
            if (EditorSceneManager.SaveCurrentModifiedScenesIfUserWantsTo()) EditorSceneManager.OpenScene(ScenePath);
        }

        // Switch to Android and the settings a Quest needs.
        [MenuItem("Blockfire/Set up for Meta Quest", false, 20)]
        public static void SetUpQuest()
        {
            if (SetUpQuestNow())
            {
                EditorUtility.DisplayDialog("Blockfire VR",
                    "Switched to Android for Meta Quest.\n\n" +
                    "Check one thing in the window that opens next: on the Android tab (the little robot), OpenXR is ticked, " +
                    "and under OpenXR, Meta Quest Support is ticked.\n\n" +
                    "Then plug your Quest in (with developer mode on) and use Blockfire > Build and run on Quest.", "OK");
                SettingsService.OpenProjectSettings("Project/XR Plug-in Management");
            }
        }

        static bool SetUpQuestNow()
        {
            if (EditorUserBuildSettings.activeBuildTarget != BuildTarget.Android)
            {
                if (!BuildPipeline.IsBuildTargetSupported(BuildTargetGroup.Android, BuildTarget.Android))
                {
                    EditorUtility.DisplayDialog("Blockfire VR",
                        "Unity needs Android Build Support to make games for the Quest.\n\n" +
                        "Close Unity, open Unity Hub, go to Installs, click the gear next to your Unity version, " +
                        "choose Add modules, and tick Android Build Support (with OpenJDK and Android SDK & NDK Tools). " +
                        "Then open this project again.", "OK");
                    return false;
                }
                if (!EditorUserBuildSettings.SwitchActiveBuildTarget(BuildTargetGroup.Android, BuildTarget.Android)) return false;
            }
            // Quests are 64-bit Android 10 or newer.
            PlayerSettings.Android.targetArchitectures = AndroidArchitecture.ARM64;
            if ((int)PlayerSettings.Android.minSdkVersion < 29) PlayerSettings.Android.minSdkVersion = (AndroidSdkVersions)29;
            PlayerSettings.productName = "Blockfire VR";
#if UNITY_2021_2_OR_NEWER
            PlayerSettings.SetScriptingBackend(UnityEditor.Build.NamedBuildTarget.Android, ScriptingImplementation.IL2CPP);
            if (PlayerSettings.GetApplicationIdentifier(UnityEditor.Build.NamedBuildTarget.Android).StartsWith("com.DefaultCompany"))
                PlayerSettings.SetApplicationIdentifier(UnityEditor.Build.NamedBuildTarget.Android, "com.blockfire.vr");
#else
            PlayerSettings.SetScriptingBackend(BuildTargetGroup.Android, ScriptingImplementation.IL2CPP);
            if (PlayerSettings.GetApplicationIdentifier(BuildTargetGroup.Android).StartsWith("com.DefaultCompany"))
                PlayerSettings.SetApplicationIdentifier(BuildTargetGroup.Android, "com.blockfire.vr");
#endif
            return true;
        }

        // Build the game and put it straight on a Quest plugged in by USB.
        [MenuItem("Blockfire/Build and run on Quest", false, 21)]
        public static void BuildAndRun()
        {
            if (!SetUpQuestNow()) return;
            if (AssetDatabase.LoadAssetAtPath<SceneAsset>(ScenePath) == null)
            {
                if (!EditorSceneManager.SaveCurrentModifiedScenesIfUserWantsTo()) return;
                MakeSceneNow();
            }
            var report = BuildPipeline.BuildPlayer(new BuildPlayerOptions
            {
                scenes = new[] { ScenePath },
                locationPathName = ApkPath,
                target = BuildTarget.Android,
                targetGroup = BuildTargetGroup.Android,
                options = BuildOptions.AutoRunPlayer,
            });
            if (report.summary.result == UnityEditor.Build.Reporting.BuildResult.Succeeded)
                Debug.Log("Blockfire VR: built " + ApkPath + " and sent it to your Quest. Find it under Apps > Unknown Sources.");
            else
                EditorUtility.DisplayDialog("Blockfire VR",
                    "The build didn't work. The Console window says why.\n\n" +
                    "The usual fixes: plug the Quest in with a USB cable, turn on developer mode in the Meta Horizon app, " +
                    "put the headset on and allow USB debugging, and check OpenXR is ticked on the Android tab of XR Plug-in Management.", "OK");
        }

        [MenuItem("Blockfire/How to play", false, 40)]
        public static void Help()
        {
            EditorUtility.DisplayDialog("Blockfire VR: how to play",
                "Survive the waves of Mossheads!\n\n" +
                "Right trigger: shoot     B: reload\n" +
                "Right stick: turn     Right stick click: swap guns\n" +
                "Left stick: walk (click it to run)     A: jump / swim up\n" +
                "Left trigger: put a block     Left grip: break a block\n" +
                "X: change block     Y: wrist display     Menu: pause\n\n" +
                "Keyboard and mouse: WASD walk, mouse look (click to grab the mouse), left click shoot, " +
                "right click build, F break, E change block, R reload, Q swap, Space jump, H wrist, Esc pause.", "OK");
        }
    }
}
