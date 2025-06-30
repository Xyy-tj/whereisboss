import aiosqlite
from fastapi import FastAPI, Request
from fastapi.responses import HTMLResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from pydantic import BaseModel
from typing import Optional
import datetime

app = FastAPI()

app.mount("/static", StaticFiles(directory="static"), name="static")
templates = Jinja2Templates(directory="templates")

DATABASE = 'database.db'

class Update(BaseModel):
    location: str
    info_source: str
    start_time: Optional[datetime.datetime] = None
    end_time: Optional[datetime.datetime] = None

class EventTimeUpdate(BaseModel):
    start_time: datetime.datetime
    end_time: datetime.datetime

class Status712Update(BaseModel):
    status: str

async def init_db():
    async with aiosqlite.connect(DATABASE) as db:
        # Schedule table
        await db.execute('''
            CREATE TABLE IF NOT EXISTS updates (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                location TEXT NOT NULL,
                info_source TEXT,
                start_time TIMESTAMP,
                end_time TIMESTAMP,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        ''')
        # 712 Status table
        await db.execute('''
            CREATE TABLE IF NOT EXISTS status_712 (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                status TEXT NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        ''')
        # Check and add columns if they don't exist
        try:
            await db.execute("ALTER TABLE updates ADD COLUMN start_time TIMESTAMP")
            await db.execute("ALTER TABLE updates ADD COLUMN end_time TIMESTAMP")
        except aiosqlite.OperationalError:
            # Columns likely already exist
            pass
        await db.commit()

@app.on_event("startup")
async def startup():
    await init_db()

@app.get("/", response_class=HTMLResponse)
async def read_root(request: Request):
    return templates.TemplateResponse("index.html", {"request": request})

@app.get("/api/status")
async def get_status():
    async with aiosqlite.connect(DATABASE) as db:
        db.row_factory = aiosqlite.Row
        query = """
            SELECT id, location, info_source, start_time, end_time, created_at 
            FROM updates 
            WHERE start_time >= datetime('now', '-1 day')
            ORDER BY start_time ASC
        """
        async with db.execute(query) as cursor:
            schedule = await cursor.fetchall()
    
    if schedule:
        return JSONResponse(content=[dict(row) for row in schedule])
    else:
        return JSONResponse(content=[])

@app.get("/api/status_712")
async def get_status_712():
    async with aiosqlite.connect(DATABASE) as db:
        db.row_factory = aiosqlite.Row
        async with db.execute('SELECT status, created_at FROM status_712 ORDER BY created_at DESC LIMIT 1') as cursor:
            latest_status = await cursor.fetchone()
    if latest_status:
        return JSONResponse(content=dict(latest_status))
    else:
        return JSONResponse(content={'status': '未知', 'created_at': ''})

@app.post("/api/status_712")
async def update_status_712(status_update: Status712Update):
    valid_statuses = ["在", "不在", "背包走了"]
    if status_update.status not in valid_statuses:
        return JSONResponse(content={'error': 'Invalid status value'}, status_code=400)
    
    async with aiosqlite.connect(DATABASE) as db:
        await db.execute('INSERT INTO status_712 (status) VALUES (?)', (status_update.status,))
        await db.commit()
    return JSONResponse(content={'success': True})

@app.post("/api/update")
async def create_status(update: Update):
    async with aiosqlite.connect(DATABASE) as db:
        await db.execute(
            'INSERT INTO updates (location, info_source, start_time, end_time) VALUES (?, ?, ?, ?)',
            (update.location, update.info_source, update.start_time, update.end_time)
        )
        await db.commit()
    return JSONResponse(content={'success': True})

@app.put("/api/update/{event_id}")
async def update_event_time(event_id: int, event_update: EventTimeUpdate):
    async with aiosqlite.connect(DATABASE) as db:
        await db.execute(
            "UPDATE updates SET start_time = ?, end_time = ? WHERE id = ?",
            (event_update.start_time, event_update.end_time, event_id)
        )
        await db.commit()
    return JSONResponse(content={'success': True})

@app.delete("/api/delete/{event_id}")
async def delete_event(event_id: int):
    async with aiosqlite.connect(DATABASE) as db:
        await db.execute("DELETE FROM updates WHERE id = ?", (event_id,))
        await db.commit()
    return JSONResponse(content={'success': True}) 