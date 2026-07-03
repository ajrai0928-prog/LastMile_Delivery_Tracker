const { db } = require('./db');

const volumetricWeight = ({ length, width, height }) => {
  return Number((length * width * height / 5000).toFixed(2));
};

const detectZone = async areaId => {
  return new Promise((resolve, reject) => {
    db.get(
      `SELECT zones.id, zones.name FROM areas JOIN zones ON areas.zone_id = zones.id WHERE areas.id = ?`,
      [areaId],
      (err, row) => {
        if (err) return reject(err);
        resolve(row || null);
      }
    );
  });
};

const findRate = async ({ fromZone, toZone, orderType }) => {
  return new Promise((resolve, reject) => {
    db.get(
      `SELECT * FROM rate_cards WHERE from_zone = ? AND to_zone = ? AND order_type = ?`,
      [fromZone, toZone, orderType],
      (err, row) => {
        if (err) return reject(err);
        resolve(row || null);
      }
    );
  });
};

const getCodSurcharge = async orderType => {
  return new Promise((resolve, reject) => {
    db.get(`SELECT surcharge FROM cod_surcharges WHERE order_type = ?`, [orderType], (err, row) => {
      if (err) return reject(err);
      resolve(row ? row.surcharge : 0);
    });
  });
};

const calculateCharge = async ({ pickupAreaId, dropAreaId, length, width, height, actualWeight, orderType, paymentType }) => {
  const pickupZone = await detectZone(pickupAreaId);
  const dropZone = await detectZone(dropAreaId);
  if (!pickupZone || !dropZone) {
    throw new Error('Unable to detect pickup or drop zone');
  }
  const volumetric = volumetricWeight({ length, width, height });
  const billed = Math.max(actualWeight, volumetric);
  const rateCard = await findRate({ fromZone: pickupZone.id, toZone: dropZone.id, orderType });
  if (!rateCard) throw new Error('No rate card configured for selected route and order type');
  const baseCharge = billed * rateCard.rate_per_kg;
  const codSurcharge = paymentType === 'COD' ? await getCodSurcharge(orderType) : 0;
  return {
    pickupZone,
    dropZone,
    volumetricWeight: volumetric,
    billedWeight: billed,
    rate: rateCard.rate_per_kg,
    charge: Number((baseCharge + codSurcharge).toFixed(2)),
    codSurcharge
  };
};

module.exports = { volumetricWeight, calculateCharge, detectZone, findRate, getCodSurcharge };
