// config.js
const ENV = 'prod'; // or 'dev'

const environments = {
  dev: {
    OFFICE_LAT: 28.71278826284781,
    OFFICE_LNG: 77.11959041050629,
    MAX_DISTANCE_METERS: 200000
  },
  prod: {
    OFFICE_LAT: 28.71278826284781,
    OFFICE_LNG: 77.11959041050629,
    MAX_DISTANCE_METERS: 100
  }
};

export const CONFIG = environments[ENV];
