CREATE FUNCTION "incrementRedirectCacheGeneration"() RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  UPDATE "RedirectCacheState"
  SET "version" = "version" + 1
  WHERE "id" = 1;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Redirect cache generation row is missing';
  END IF;
  RETURN NULL;
END;
$$;

CREATE TRIGGER "ArticleRedirect_cache_generation"
AFTER INSERT OR UPDATE OR DELETE ON "ArticleRedirect"
FOR EACH STATEMENT
EXECUTE FUNCTION "incrementRedirectCacheGeneration"();
