// Uygulama adı "AI Haberleri" → "News" oldu. Ayarlar, favoriler ve okunma durumu
// kaybolmasın diye veri klasörü eski adda sabit tutulur. Diğer modüllerden ÖNCE import edilmeli.
import { app } from "electron";
import path from "path";

app.setPath("userData", path.join(app.getPath("appData"), "AI Haberleri"));
