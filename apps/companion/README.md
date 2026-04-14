# SketchBot Camera Buddy

Native Expo companion app for same-network SketchBot desktop classrooms.

## What Changed

Camera Buddy now uses a real WebRTC live stream for the main camera path.

That means:

- smooth live video instead of rapid photo uploads
- no more `takePictureAsync` slideshow loop as the main experience
- the phone publishes live video to SketchBot Desktop over the same Wi-Fi
- the desktop still samples lightweight analysis frames locally for AprilTags

## Important

Because `react-native-webrtc` uses native code, **Camera Buddy no longer runs in Expo Go**.

Use an Expo **development build** instead.

## First-Time Setup

```bash
cd apps/companion
npm install
npm run prebuild
```

Then build onto your device:

```bash
npm run android
```

or

```bash
npm run ios
```

After that, start Metro for the dev client:

```bash
npm start
```

## Classroom Flow

1. Start SketchBot Desktop on the laptop.
2. Make sure the phone and laptop are on the same Wi-Fi.
3. Open Camera Buddy from the Expo development build.
4. Point the phone at the room QR code on the laptop.
5. Tap `Go Live`.

## Notes

- This path is designed for local classrooms and same-network robot sessions.
- It does not require TURN, Twilio, or a VPS for the first version.
- Future certified hardware kits can still use the reserved `kit-webrtc` backend path.
