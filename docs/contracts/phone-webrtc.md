# Phone WebRTC Contract

## Purpose

Define the initial backend and frontend contract for the `phone-webrtc` camera source.

This contract is the first formal step away from the temporary `browser-camera` JPEG upload prototype.

## Design intent

The phone acts as a camera publisher.
The dashboard acts as a viewer.
The backend remains the source of truth for session metadata, source selection, and operator-visible health.

This contract does not require the backend to be the media transport itself forever, but it does require the backend to own session coordination metadata.

## Source identity

Canonical source id:

- `phone-webrtc`

Transition note:

- `browser-camera` remains a temporary fallback source for the current JPEG upload prototype
- new work should target `phone-webrtc`

## State additions

Recommended camera state shape additions:

```json
{
  "camera": {
    "source": "phone-webrtc",
    "source_status": "awaiting-publisher",
    "supports_webrtc": true,
    "latest_frame_url": null,
    "media_session": {
      "session_id": "ms_123",
      "ingest_protocol": "whip",
      "viewer_protocol": "webrtc",
      "publisher_status": "awaiting-publisher",
      "viewer_status": "idle",
      "analysis_mode": "sampled-downscaled",
      "whip_url": "/api/camera/phone-webrtc/whip",
      "viewer_path": "/api/camera/phone-webrtc/viewer"
    }
  }
}
```

## Status values

### `camera.source`

- `browser-camera`
- `phone-webrtc`
- `external-camera`
- `kit-webrtc`
- `demo`

### `camera.source_status`

Recommended values for `phone-webrtc`:

- `idle`
- `awaiting-session`
- `awaiting-publisher`
- `publishing`
- `viewer-ready`
- `degraded`
- `offline`

### `camera.media_session.publisher_status`

- `idle`
- `provisioned`
- `awaiting-publisher`
- `publishing`
- `disconnected`
- `failed`

### `camera.media_session.viewer_status`

- `idle`
- `ready`
- `viewing`
- `disconnected`
- `failed`

## Provisioning endpoint

### `POST /api/camera/phone-webrtc/session`

Purpose:

- provision or refresh session metadata for a phone publisher flow

Request:

```json
{
  "device_label": "Ahmad iPhone",
  "force_new": false
}
```

Response:

```json
{
  "accepted": true,
  "source": "phone-webrtc",
  "source_status": "awaiting-publisher",
  "session_id": "ms_123",
  "ingest_protocol": "whip",
  "viewer_protocol": "webrtc",
  "publisher_status": "awaiting-publisher",
  "viewer_status": "idle",
  "analysis_mode": "sampled-downscaled",
  "whip_url": "/api/camera/phone-webrtc/whip",
  "viewer_path": "/api/camera/phone-webrtc/viewer",
  "message": "Phone WebRTC session provisioned"
}
```

## Read endpoint

### `GET /api/camera/phone-webrtc/session`

Purpose:

- read current session status without creating a new session

Response:

- same shape as provisioning response, minus fields that imply mutation if desired

## Reserved future endpoints

These endpoints are part of the contract direction, even if the first implementation slice only scaffolds them.

### `POST /api/camera/phone-webrtc/whip`

Purpose:

- WHIP ingest endpoint for standards-aligned phone publishing

### `POST /api/camera/phone-webrtc/viewer`

Purpose:

- viewer negotiation endpoint or media-server-specific viewer bootstrap

Exact behavior may depend on the selected media stack.

## Frontend responsibilities

### Publisher page

The phone publisher page should:

- request provisioning from the backend
- show session status
- publish using the returned session metadata
- display reconnect / error state clearly

### Dashboard

The dashboard should:

- show `phone-webrtc` as a first-class source
- render viewer health separately from localization freshness
- keep overlays independent from the raw stream transport

## Backend responsibilities

The backend must:

- own source selection
- own session metadata
- expose operator-readable publish/viewer state
- avoid conflating display transport with analysis transport

The backend should not:

- assume every source produces immediately readable JPEG frames
- require localization success in order to consider the stream healthy

## Vision responsibilities

The vision path should not assume it receives every display frame.

Instead:

- it should receive sampled analysis frames
- it should update localization freshness independently
- it should publish confidence and timestamps into backend state

## Compatibility expectations

Short term:

- `browser-camera` remains available as a fallback implementation path

Medium term:

- `phone-webrtc` becomes the preferred phone camera path

Long term:

- `browser-camera` may be retained only as a dev/debug fallback
