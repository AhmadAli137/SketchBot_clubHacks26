# EAS Dev Builds

Short guide for building the native `Camera Buddy` app with Expo Application Services (`EAS`).

## Why EAS

`Camera Buddy` now uses `react-native-webrtc`, which is a native module.

That means:

- `Expo Go` is **not enough**
- you need a real **development build**
- `EAS` can build that app for you in the cloud

## One-Time Setup

From the companion app folder:

```powershell
cd C:\Users\Ahmad\OneDrive\Desktop\RoboticsPro\SketchBot_clubHacks26\apps\companion
```

Install the CLI:

```powershell
npm install -g eas-cli
```

If PowerShell does not recognize `eas`, use `npx`:

```powershell
npx eas-cli --version
```

Log in:

```powershell
npx eas-cli login
```

Configure the app for EAS:

```powershell
npx eas-cli build:configure
```

Recommended answers:

- create EAS project: `Y`
- configure platforms: `All`

## Android Dev Build

Run:

```powershell
npx eas-cli build --platform android --profile development
```

Recommended answers:

- generate Android keystore: `Y`

When the build finishes:

1. open the build link on your phone
2. install the dev build
3. return to the laptop and start Metro:

```powershell
npm start
```

## iPhone Dev Build

Run:

```powershell
npx eas-cli build --platform ios --profile development
```

Notes:

- this usually requires Apple signing setup
- EAS will walk you through it

## Daily Dev Flow

Start the desktop app from the repo root:

```powershell
cd C:\Users\Ahmad\OneDrive\Desktop\RoboticsPro\SketchBot_clubHacks26
npm run desktop:dev
```

Start the companion app Metro server:

```powershell
cd C:\Users\Ahmad\OneDrive\Desktop\RoboticsPro\SketchBot_clubHacks26\apps\companion
npm start
```

Then on the phone:

1. open the installed `SketchBot Camera Buddy` dev build
2. scan the room QR from the desktop app
3. tap `Go Live`

## Useful Commands

Check EAS:

```powershell
npx eas-cli --version
```

See recent builds:

```powershell
npx eas-cli build:list
```

Open build dashboard:

```powershell
npx eas-cli build:view
```

Re-run Android dev build:

```powershell
npx eas-cli build --platform android --profile development
```

Re-run iPhone dev build:

```powershell
npx eas-cli build --platform ios --profile development
```

## Common Problems

### `eas` is not recognized

Use:

```powershell
npx eas-cli ...
```

### Expo Go opens instead of your app

Use the installed **development build**, not Expo Go.

### Android Studio missing

You do **not** need Android Studio if you are using EAS cloud builds.

### Live stream still does not work

Check these first:

- desktop app is running
- phone and laptop are on the same Wi-Fi
- Camera Buddy scanned the room QR
- the room address starts with your LAN IP like `http://192.168.x.x:8787`
