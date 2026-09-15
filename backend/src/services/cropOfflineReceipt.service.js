function conflict(message) {
  return Object.assign(new Error(message), { status: 409 });
}

async function findCropOperationReceipt(client, shopId, clientRequestId, operation) {
  if (!clientRequestId) return null;
  const receipt = await client.cropOperationReceipt.findUnique({
    where: { shopId_clientRequestId: { shopId, clientRequestId } },
  });
  if (receipt && receipt.operation !== operation) {
    throw conflict("This offline retry key was already used for a different field operation");
  }
  return receipt;
}

async function recordCropOperationReceipt(client, { shopId, clientRequestId, operation, resourceType, resourceId }) {
  if (!clientRequestId) return null;
  return client.cropOperationReceipt.create({
    data: { shopId, clientRequestId, operation, resourceType, resourceId },
  });
}

module.exports = { findCropOperationReceipt, recordCropOperationReceipt };
