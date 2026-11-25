update storage.buckets set file_size_limit = 1048576
where id = 'go-catalog-photos' and file_size_limit = 270000;
