export function validate(schemas) {
  return function validationMiddleware(req, res, next) {
    try {
      for (const [location, schema] of Object.entries(schemas)) {
        req[location] = schema.parse(req[location]);
      }
      next();
    } catch (error) {
      next(error);
    }
  };
}
