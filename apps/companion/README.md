# SketchBot Camera Buddy

Expo-based camera companion for same-network SketchBot desktop setups.

## What It Does

- previews the device camera
- switches front/back camera
- connects to a local SketchBot backend over LAN
- uploads JPEG frames to `/api/camera/companion-frame`
- marks the backend source as `companion-camera`

This app is intended for:

- phones
- tablets
- classroom carts
- operator-side companion devices on the same Wi-Fi as the dashboard laptop

## Run It

```bash
cd apps/companion
npm install
npm start
```

Then open it in Expo Go or a simulator/device.

## Use It

1. Start the backend on your laptop.
2. Open the desktop dashboard and choose `Companion App`.
3. In the app, enter the room address shown in the desktop app, for example:
   `http://192.168.2.16:8787`
4. Keep the device on the same Wi-Fi as the laptop.
5. Tap `Go Live`.

## Notes

- This path is designed for same-network use and avoids TURN/Twilio/VPS requirements.
- It favors reliability and simplicity over low-latency browser WebRTC.
- The app assumes the desktop operator and companion device are in the same room on the same Wi-Fi.
- Future certified hardware kits can still use the reserved `kit-webrtc` backend path.
