/* Ancien service worker de la racine : l'application est maintenant dans /trade/ (son propre sw.js).
   Ce fichier supprime l'ancien cache et se désinscrit, pour que la page d'accueil ne soit jamais servie par l'ancienne copie. */
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", e => {
  e.waitUntil((async () => {
    const ks = await caches.keys();
    await Promise.all(ks.map(k => caches.delete(k)));
    await self.registration.unregister();
    const cs = await self.clients.matchAll({ type: "window" });
    cs.forEach(c => { try { c.navigate(c.url); } catch (e) {} });
  })());
});
