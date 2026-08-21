require("dotenv").config();

const express = require("express");

const { initializeApp, cert } = require("firebase-admin/app");

const {
  getFirestore,
  FieldValue,
} = require("firebase-admin/firestore");

// =====================================================
// CONFIGURAÇÃO
// =====================================================

const app = express();

const PORT = process.env.PORT || 3000;

// Permite receber JSON
app.use(express.json());

// =====================================================
// INÍCIO
// =====================================================

console.log("========================================");
console.log("🚀 INICIANDO SERVIDOR DO REGADOR");
console.log("========================================");

// =====================================================
// VERIFICAR VARIÁVEIS
// =====================================================

console.log(
  "PROJECT:",
  process.env.FIREBASE_PROJECT_ID
);

console.log(
  "EMAIL:",
  process.env.FIREBASE_CLIENT_EMAIL
);

console.log(
  "KEY EXISTS:",
  !!process.env.FIREBASE_PRIVATE_KEY
);

// =====================================================
// FIREBASE
// =====================================================

try {

  if (!process.env.FIREBASE_PROJECT_ID) {
    throw new Error(
      "FIREBASE_PROJECT_ID não foi encontrada."
    );
  }

  if (!process.env.FIREBASE_CLIENT_EMAIL) {
    throw new Error(
      "FIREBASE_CLIENT_EMAIL não foi encontrada."
    );
  }

  if (!process.env.FIREBASE_PRIVATE_KEY) {
    throw new Error(
      "FIREBASE_PRIVATE_KEY não foi encontrada."
    );
  }

  initializeApp({

    credential: cert({

      projectId:
        process.env.FIREBASE_PROJECT_ID,

      clientEmail:
        process.env.FIREBASE_CLIENT_EMAIL,

      privateKey:
        process.env.FIREBASE_PRIVATE_KEY
          .replace(/\\n/g, "\n")
          .trim(),

    }),

  });

  console.log(
    "✅ Firebase inicializado!"
  );

} catch (error) {

  console.error(
    "❌ ERRO AO INICIALIZAR FIREBASE:"
  );

  console.error(error);

  process.exit(1);
}

const db = getFirestore();

// =====================================================
// NORMALIZAR ESP ID
// =====================================================

function normalizarEspId(espId) {

  if (!espId) {
    return "";
  }

  return String(espId)
    .replace(/:/g, "")
    .replace(/-/g, "")
    .replace(/\s/g, "")
    .toUpperCase();
}

// =====================================================
// PROCURAR PAREAMENTO
// =====================================================

async function procurarPareamento(
  espIdRecebido
) {

  const espNormalizada =
    normalizarEspId(espIdRecebido);

  console.log(
    `🔎 Procurando pareamento para: ${espIdRecebido}`
  );

  console.log(
    `🔎 ESP normalizada: ${espNormalizada}`
  );

  const snapshot = await db
    .collection("paired_devices")
    .get();

  for (const doc of snapshot.docs) {

    const data = doc.data();

    if (!data.espId) {
      continue;
    }

    const espFirestore =
      normalizarEspId(data.espId);

    console.log(
      `   Comparando: ${espFirestore}`
    );

    if (
      espFirestore === espNormalizada
    ) {

      console.log(
        `✅ Pareamento encontrado: ${doc.id}`
      );

      return {

        docId: doc.id,

        userId: data.userId,

        plantaId: data.plantaId,

        espId: data.espId,

        status: data.status,

      };
    }
  }

  return null;
}

// =====================================================
// HEALTH CHECK
// =====================================================

app.get("/health", (req, res) => {

  res.status(200).json({

    status: "online",

    servidor:
      "regador-server",

    firebase:
      "conectado",

    timestamp:
      new Date().toISOString(),

  });

});

// =====================================================
// RECEBER DADOS DA ESP32
// =====================================================

app.post(
  "/api/sensores",
  async (req, res) => {

    console.log("");
    console.log(
      "========================================"
    );

    console.log(
      "📥 DADOS RECEBIDOS DA ESP32"
    );

    console.log(
      "========================================"
    );

    console.log(req.body);

    try {

      const {

        espId,

        dataHora,

        temperatura,

        umidade,

        luminosidade,

      } = req.body;

      // =================================================
      // VALIDAR ESP ID
      // =================================================

      if (!espId) {

        console.warn(
          "⚠️ Dados recebidos sem espId"
        );

        return res.status(400).json({

          sucesso: false,

          erro:
            "espId não informado",

        });
      }

      // =================================================
      // PROCURAR PAREAMENTO
      // =================================================

      const pareamento =
        await procurarPareamento(
          espId
        );

      if (!pareamento) {

        console.warn(
          `⚠️ ESP ${espId} não está pareada`
        );

        return res.status(404).json({

          sucesso: false,

          erro:
            "ESP não está pareada",

          espId: espId,

        });
      }

      const {
        userId,
        plantaId,
      } = pareamento;

      console.log("");
      console.log(
        "========================================"
      );

      console.log(
        "🌱 PAREAMENTO ENCONTRADO"
      );

      console.log(
        "========================================"
      );

      console.log(
        "ESP:",
        espId
      );

      console.log(
        "Usuário:",
        userId
      );

      console.log(
        "Planta:",
        plantaId
      );

      // =================================================
      // CONVERTER VALORES
      // =================================================

      const temperaturaNumero =
        Number(temperatura ?? 0);

      const umidadeNumero =
        Number(umidade ?? 0);

      const luminosidadeNumero =
        Number(luminosidade ?? 0);

      // =================================================
      // REFERÊNCIA TEMPO REAL
      // =================================================

      const tempoRealRef = db

        .collection("users")

        .doc(userId)

        .collection("plantas")

        .doc(plantaId)

        .collection("sensores")

        .doc("tempo_real");

      // =================================================
      // SALVAR TEMPO REAL
      // =================================================

      await tempoRealRef.set({

        espId: espId,

        temperatura:
          temperaturaNumero,

        umidade:
          umidadeNumero,

        luminosidade:
          luminosidadeNumero,

        dataHoraESP:
          dataHora ?? null,

        updatedAt:
          FieldValue.serverTimestamp(),

      }, {

        merge: true,

      });

      console.log("");
      console.log(
        "========================================"
      );

      console.log(
        "✅ TEMPO REAL SALVO NO FIRESTORE"
      );

      console.log(
        "========================================"
      );

      console.log(
        "Planta:",
        plantaId
      );

      console.log(
        "Temperatura:",
        temperaturaNumero
      );

      console.log(
        "Umidade:",
        umidadeNumero
      );

      console.log(
        "Luminosidade:",
        luminosidadeNumero
      );

      // =================================================
      // ATUALIZAR PAREAMENTO
      // =================================================

      await db

        .collection("paired_devices")

        .doc(pareamento.docId)

        .set({

          updatedAt:
            FieldValue.serverTimestamp(),

        }, {

          merge: true,

        });

      // =================================================
      // RESPOSTA PARA ESP32
      // =================================================

      return res.status(200).json({

        sucesso: true,

        mensagem:
          "Dados recebidos e salvos",

        espId: espId,

        plantaId: plantaId,

        dados: {

          temperatura:
            temperaturaNumero,

          umidade:
            umidadeNumero,

          luminosidade:
            luminosidadeNumero,

        },

      });

    } catch (error) {

      console.error("");

      console.error(
        "❌ ERRO AO PROCESSAR DADOS:"
      );

      console.error(error);

      return res.status(500).json({

        sucesso: false,

        erro:
          "Erro interno do servidor",

        mensagem:
          error.message,

      });

    }

  }
);

// =====================================================
// PÁGINA PRINCIPAL
// =====================================================

app.get("/", (req, res) => {

  res.status(200).send(`

    <html>

      <head>

        <meta charset="UTF-8">

        <title>
          Regador Automático
        </title>

      </head>

      <body>

        <h1>
          🌱 Regador Automático
        </h1>

        <p>
          Servidor online.
        </p>

        <p>
          Endpoint:
          <strong>
            POST /api/sensores
          </strong>
        </p>

        <p>
          Status:
          <strong>
            OK
          </strong>
        </p>

      </body>

    </html>

  `);

});

// =====================================================
// INICIAR SERVIDOR
// =====================================================

app.listen(
  PORT,
  "0.0.0.0",
  () => {

    console.log("");

    console.log(
      "========================================"
    );

    console.log(
      "🚀 SERVIDOR HTTP INICIADO"
    );

    console.log(
      "========================================"
    );

    console.log(
      `🌐 Porta: ${PORT}`
    );

    console.log(
      "📡 POST /api/sensores"
    );

    console.log(
      "❤️ GET /health"
    );

    console.log(
      "🌱 GET /"
    );

    console.log(
      "========================================"
    );

  }
);
