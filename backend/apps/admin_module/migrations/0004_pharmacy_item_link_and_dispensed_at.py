import django.db.models.deletion
from django.db import migrations, models


def backfill_prescription_item(apps, schema_editor):
    PharmacyBillItem = apps.get_model("admin_module", "PharmacyBillItem")
    PrescriptionItem = apps.get_model("admin_module", "PrescriptionItem")
    for bill_item in PharmacyBillItem.objects.filter(prescription_item__isnull=True).select_related("bill"):
        match = PrescriptionItem.objects.filter(
            prescription_id=bill_item.bill.prescription_id,
            medicine_id=bill_item.medicine_id,
        ).first()
        if match:
            bill_item.prescription_item = match
            bill_item.save(update_fields=["prescription_item"])


class Migration(migrations.Migration):

    dependencies = [
        ("admin_module", "0003_labreport_labbillitem_order_item_and_more"),
    ]

    operations = [
        migrations.AddField(
            model_name="prescription",
            name="dispensed_at",
            field=models.DateTimeField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name="pharmacybillitem",
            name="prescription_item",
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.PROTECT,
                related_name="bill_items",
                to="admin_module.prescriptionitem",
            ),
        ),
        migrations.RunPython(backfill_prescription_item, migrations.RunPython.noop),
    ]
