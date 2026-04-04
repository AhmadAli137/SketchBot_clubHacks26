from fastapi import APIRouter

from app.api import camera, compose, health, jobs, robot, sim, state, upload, views, webrtc, ws

api_router = APIRouter()
api_router.include_router(health.router, tags=["health"])
api_router.include_router(state.router, prefix="/api", tags=["state"])
api_router.include_router(jobs.router, prefix="/api", tags=["jobs"])
api_router.include_router(sim.router, tags=["simulation"])
api_router.include_router(views.router, tags=["views"])
api_router.include_router(camera.router, tags=["camera"])
api_router.include_router(webrtc.router, tags=["webrtc"])
api_router.include_router(compose.router, tags=["compose"])
api_router.include_router(robot.router, tags=["robot"])
api_router.include_router(upload.router, tags=["upload"])
api_router.include_router(ws.router, tags=["ws"])
