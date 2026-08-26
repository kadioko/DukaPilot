const router = require("express").Router();
const ctrl = require("../controllers/publicQuotation.controller");

router.get("/:token", ctrl.get);
router.post("/:token/accept", ctrl.accept);
router.post("/:token/reject", ctrl.reject);

module.exports = router;
