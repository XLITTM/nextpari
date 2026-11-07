function NativeClient() {
  const error = new Error('pg-native is not installed');
  error.code = 'MODULE_NOT_FOUND';
  throw error;
}

export default NativeClient;
