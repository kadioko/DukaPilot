const router = require("express").Router();
const controller = require("../controllers/metaWhatsAppWebhook.controller");

router.get("/meta-whatsapp", controller.verify);
router.post("/meta-whatsapp", controller.receive);

module.exports = router;
