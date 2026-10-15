# Find Someone (free pathway)

Anonymous reconnect tool on the home page under **Intel**. Not behind Accounting / Intel paid gates — restore + approved account only.

## Flow

1. User posts **place** (country/city/town) + **approx date (dd/mm/yyyy)** + a **recognition question**.
2. Posts show with **no username**.
3. Another user taps **I recognise this**, types an answer — **only the original poster** sees that answer.
4. Poster taps **This is them — open chat** on the right answer.
5. Private 1:1 messaging opens between those two accounts. Still invisible to everyone else.

## Routes

- `/find-someone` — list + create
- `/find-someone/[id]` — recognise / answer / accept / chat
- `/api/find-someone` — list / create
- `/api/find-someone/[id]` — detail / answer / accept
- `/api/find-someone/[id]/messages` — matched chat only

## Data

Global (cross-user): `data/find-someone/posts.json`, `answers.json`, `messages.json`.

Author and responder emails stay server-side; public payloads never include them.
