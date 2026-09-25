import { initializeApp, type FirebaseApp, type FirebaseOptions } from "firebase/app";
import { FIREBASE } from "./config";

let app: FirebaseApp | null = null;

export function firebaseApp(): FirebaseApp {
  if (!app) {
    const opts: FirebaseOptions = { projectId: FIREBASE.projectId, databaseURL: FIREBASE.databaseURL };
    if (FIREBASE.apiKey) opts.apiKey = FIREBASE.apiKey;
    app = initializeApp(opts);
  }
  return app;
}
