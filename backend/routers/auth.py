from fastapi import APIRouter, HTTPException, Depends, Response
from pydantic import BaseModel
from database import db, serialize
from auth_utils import (
    verify_password, hash_password, create_access_token, get_current_user,
    require_roles, new_id, now_iso, LOCKOUT_THRESHOLD, ANY_SUPERVISOR,
)
from utils import log_activity

router = APIRouter(prefix="/api/auth", tags=["auth"])


class LoginBody(BaseModel):
    username: str
    password: str


@router.post("/login")
async def login(body: LoginBody, response: Response):
    username = body.username.strip().lower()
    user = await db.users.find_one({"username": username})

    await db.user_login_attempts.insert_one({
        "id": new_id(), "username": username, "attempted_at": now_iso(),
    })

    if not user:
        raise HTTPException(status_code=401, detail="Invalid User ID or password")

    if user.get("locked"):
        raise HTTPException(status_code=403, detail="Account locked due to multiple failed login attempts. Please contact supervisor.")

    if not verify_password(body.password, user["password_hash"]):
        failed = user.get("failed_attempts", 0) + 1
        update = {"failed_attempts": failed}
        if failed > LOCKOUT_THRESHOLD:
            update["locked"] = True
        await db.users.update_one({"id": user["id"]}, {"$set": update})
        if failed > LOCKOUT_THRESHOLD:
            raise HTTPException(status_code=403, detail="Account locked due to multiple failed login attempts. Please contact supervisor.")
        raise HTTPException(status_code=401, detail=f"Invalid User ID or password. {LOCKOUT_THRESHOLD + 1 - failed} attempt(s) remaining before lockout.")

    await db.users.update_one({"id": user["id"]}, {"$set": {"failed_attempts": 0}})
    token = create_access_token(user["id"], user["username"], user["role"])
    response.set_cookie(key="access_token", value=token, httponly=True, secure=False, samesite="lax", max_age=43200, path="/")
    await log_activity(user["username"], user["role"], "Login", {})
    user_out = serialize(user)
    user_out.pop("password_hash", None)
    return {"user": user_out, "token": token}


@router.post("/logout")
async def logout(response: Response, user: dict = Depends(get_current_user)):
    response.delete_cookie("access_token", path="/")
    await log_activity(user["username"], user["role"], "Logout", {})
    return {"message": "Logged out"}


@router.get("/me")
async def me(user: dict = Depends(get_current_user)):
    user = dict(user)
    user.pop("password_hash", None)
    return user


@router.post("/unlock/{user_id}")
async def unlock_user(user_id: str, current=Depends(require_roles("operations_supervisor", "admin"))):
    target = await db.users.find_one({"id": user_id})
    if not target:
        raise HTTPException(status_code=404, detail="User not found")
    await db.users.update_one({"id": user_id}, {"$set": {"locked": False, "failed_attempts": 0}})
    await log_activity(current["username"], current["role"], "Unlocked user account", {"target_user": target["username"]})
    return {"message": f"{target['username']} unlocked"}
