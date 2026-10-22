import { PrismaClient } from '@prisma/client';
import { getFaultMeaning } from '../src/devices/product-fault-schemas';
import {
  upsertFaultCodeDefinitions,
  verifyWaterHeaterDictionary,
  WATER_HEATER_PRODUCT_ID,
} from '../src/fault-codes/fault-code-catalog';

const prisma = new PrismaClient();
const SAMPLE_PRODUCT_ID = '1x0qz5jtlabxywcg';
const SAMPLE_LABEL = 'E1';

async function main() {
  const summary = await upsertFaultCodeDefinitions(prisma);
  const waterHeater = await verifyWaterHeaterDictionary(prisma);
  const meaning = getFaultMeaning(SAMPLE_PRODUCT_ID, SAMPLE_LABEL);
  const sample = await prisma.faultCodeDefinition.findUnique({
    where: {
      productId_code_label: {
        productId: SAMPLE_PRODUCT_ID,
        code: 'fault',
        label: SAMPLE_LABEL,
      },
    },
  });
  if (!meaning || sample?.symptom !== meaning.symptom) {
    throw new Error(
      `已匹配故障码 ${SAMPLE_PRODUCT_ID}/${SAMPLE_LABEL} 的 symptom 未按含义回填：${sample?.symptom ?? '（空）'}`,
    );
  }
  console.log(
    JSON.stringify(
      {
        summary,
        waterHeater,
        sample: {
          productId: SAMPLE_PRODUCT_ID,
          label: SAMPLE_LABEL,
          symptom: sample.symptom,
          notifyAftersales: sample.notifyAftersales,
          countInQualityRate: sample.countInQualityRate,
        },
      },
      null,
      2,
    ),
  );
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
