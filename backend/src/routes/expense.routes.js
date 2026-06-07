const router = require("express").Router();
const { list, create, update, remove } = require("../controllers/expense.controller");
const { authenticate, requireRole } = require("../middleware/auth");

router.use(authenticate);
router.use(requireRole("MERCHANT", "ADMIN"));

router.get("/", list);
router.post("/", create);
router.patch("/:id", update);
router.delete("/:id", remove);

module.exports = router;
