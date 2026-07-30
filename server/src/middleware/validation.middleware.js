export function validate(schemas) {
  return function validationMiddleware(req, res, next) {
    try {
      for (const [location, schema] of Object.entries(schemas)) {
        const parsed = schema.parse(req[location]);

        req.validated ??= {};
        req.validated[location] = parsed;

        if (location !== 'query') {
          req[location] = parsed;
        }
      }
      next();
    } catch (error) {
      next(error);
    }
  };
}
