-- CreateTable
CREATE TABLE "media" (
    "id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "file_name" TEXT NOT NULL,
    "content_type" TEXT NOT NULL,
    "byte_size" INTEGER NOT NULL,
    "sha256" TEXT NOT NULL,
    "storage_key" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "media_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "media_storage_key_key" ON "media"("storage_key");

-- CreateIndex
CREATE INDEX "media_project_id_idx" ON "media"("project_id");

-- AddForeignKey
ALTER TABLE "media" ADD CONSTRAINT "media_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
