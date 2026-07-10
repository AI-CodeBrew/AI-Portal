-- Multiple product images; image_url remains the selected thumbnail

alter table store_products
  add column if not exists image_urls text[] not null default '{}';

-- Backfill existing single image into the gallery array
update store_products
set image_urls = array[image_url]
where image_url is not null
  and image_url <> ''
  and (image_urls is null or cardinality(image_urls) = 0);
