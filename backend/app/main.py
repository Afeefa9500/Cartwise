from fastapi import FastAPI

from app.api.routes import router


app = FastAPI(
    title="CartWise API",
    description="CartWise product comparison backend",
    version="1.0.0"
)


app.include_router(router)


@app.get("/")
def root():
    return {
        "message": "CartWise backend is running"
    }


@app.get("/health")
def health():
    return {
        "status": "ok"
    }