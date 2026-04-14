from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

app = FastAPI(title='SketchBot Cloud Backend', version='0.1.0')

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        'http://127.0.0.1:3002',
        'http://localhost:3002',
    ],
    allow_credentials=True,
    allow_methods=['*'],
    allow_headers=['*'],
)


@app.get('/')
def root() -> dict:
    return {
        'name': 'SketchBot Cloud Backend',
        'version': '0.1.0',
        'status': 'ok',
        'mode': 'administrative',
    }


@app.get('/api/public/site')
def public_site() -> dict:
    return {
        'brand': 'SketchBot',
        'headline': 'Desktop-first classroom robotics with cloud administration',
        'desktop_app': 'SketchBot Desktop',
        'companion_app': 'SketchBot Camera Buddy',
    }


@app.get('/api/admin/summary')
def admin_summary() -> dict:
    return {
        'organization_count': 12,
        'desktop_channel': 'stable',
        'companion_channel': 'stable',
        'latest_desktop_version': '0.1.0',
        'latest_companion_version': '0.1.0',
        'support_status': 'green',
    }


@app.get('/api/releases/latest')
def latest_releases() -> dict:
    return {
        'desktop': {'version': '0.1.0', 'channel': 'stable'},
        'companion': {'version': '0.1.0', 'channel': 'stable'},
    }
