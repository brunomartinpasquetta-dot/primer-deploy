-- Paso 5: Eliminar 18 tablas backup acumuladas
-- Todas son snapshots de limpieza/migración de sesiones anteriores
-- Ninguna tiene FK ni es referenciada por código
-- Fecha: 2026-04-09

DROP TABLE _bkp_cc_cliente2_20260408;
DROP TABLE _bkp_clasificacion_20260408_ws;
DROP TABLE _bkp_despalillado_20260408;
DROP TABLE _bkp_despalillado_20260408_ws;
DROP TABLE _bkp_Embalaje_20260407;
DROP TABLE _bkp_embalaje_20260408_ws;
DROP TABLE _bkp_juntada_20260408;
DROP TABLE _bkp_juntada_20260408_ws;
DROP TABLE _bkp_Juntada_testing_20260407;
DROP TABLE _bkp_juntadadestino_20260408;
DROP TABLE _bkp_loteclasificadores_20260408_ws;
DROP TABLE _bkp_lotecosecheros_20260408_ws;
DROP TABLE _bkp_lotedespalilladores_20260408_ws;
DROP TABLE _bkp_lotesmercaderia_20260408_ws;
DROP TABLE _bkp_movdeposito_20260408_ws;
DROP TABLE _bkp_MovimientosDeposito_20260407;
DROP TABLE _bkp_stockmercaderia_20260408_ws;
DROP TABLE _bkp_stockmercaderia_final_20260409;
