# TODO

## Current decision

We are continuing without TURN for now.

That is acceptable for:
- local development
- same-network demos
- initial hosted testing where peer-to-peer WebRTC happens to connect directly

That is risky for:
- phone on cellular while dashboard is on another network
- restrictive NAT or firewall environments
- production demos where connection reliability matters

## Future task: TURN for production WebRTC

Goal:
- make phone-to-dashboard WebRTC reliable across different networks

Why:
- STUN-only WebRTC may fail when direct peer connectivity is blocked
- TURN provides relay fallback for those cases

Current code already supports this later via backend-provided ICE config:
- static ICE/TURN env configuration
- optional Twilio-backed dynamic ICE credentials

Files already prepared:
- `backend/app/core/settings.py`
- `backend/app/services/ice_config_service.py`
- `backend/app/api/webrtc.py`
- `backend/app/api/camera.py`
- `docs/deployment/vercel-render.md`

## When to revisit

Revisit TURN if any of these happen:
- phone publishing works on Wi-Fi but fails on cellular
- dashboard viewer stays stuck negotiating
- users test from different homes, offices, or campuses
- we want a production demo with fewer connection surprises

## Static TURN setup later

Backend env vars:

```env
WEBRTC_ICE_PROVIDER=static
WEBRTC_STUN_URLS=stun:stun.l.google.com:19302,stun:stun1.l.google.com:19302
WEBRTC_TURN_URLS=turn:your-turn-host:3478?transport=udp,turn:your-turn-host:3478?transport=tcp
WEBRTC_TURN_USERNAME=your_username
WEBRTC_TURN_CREDENTIAL=your_password
```

## Twilio TURN setup later

Backend env vars:

```env
WEBRTC_ICE_PROVIDER=twilio
TWILIO_ACCOUNT_SID=
TWILIO_API_KEY=
TWILIO_API_SECRET=
TWILIO_TOKEN_TTL=3600
```

## Bigger future milestone

After TURN, the next media architecture step is:
- move from direct peer signaling toward WHIP/SFU-based media infrastructure
